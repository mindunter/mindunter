'use strict';
const { app, BrowserWindow, ipcMain, dialog, session, desktopCapturer, systemPreferences, shell, nativeTheme } = require('electron');
const path = require('path');
const fs = require('fs');
const settingsStore = require('./settings');
const sarvam = require('./sarvam');
const kenpath = require('./kenpath');
const usage = require('./usage');
const translator = require('./translator');
const media = require('./media');
const projects = require('./projects');
const { pathToFileURL } = require('url');

let win;

// macOS 13+: allow capturing the sound that is playing on the Mac (for Live mode).
if (process.platform === 'darwin') {
  app.commandLine.appendSwitch('enable-features', 'MacLoopbackAudioForScreenShare,MacSckSystemAudioLoopbackOverride');
}
const openedFiles = new Set(); // only files the user picked may be read

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 880,
    minWidth: 720,
    minHeight: 560,
    title: 'Anuvaada: Tamil → Kannada',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#131118' : '#f7f4ee',
    icon: path.join(__dirname, '..', '..', 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  // Never let a dropped file or link replace the app's page.
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function setupMediaPermissions() {
  const ses = session.defaultSession;
  // Microphone + "system audio" (display capture) are the only permissions the app uses.
  const allowed = new Set(['media', 'display-capture', 'clipboard-sanitized-write']);
  ses.setPermissionRequestHandler((_wc, permission, cb) => cb(allowed.has(permission)));
  ses.setPermissionCheckHandler((_wc, permission) => allowed.has(permission));

  // "System audio" capture: what is playing on the laptop (YouTube, Hotstar, VLC...).
  // We grab the first screen with loopback audio; the renderer discards the video track.
  ses.setDisplayMediaRequestHandler(
    (_request, callback) => {
      desktopCapturer
        .getSources({ types: ['screen'] })
        .then((sources) => callback({ video: sources[0], audio: 'loopback' }))
        .catch(() => callback({}));
    },
    { useSystemPicker: false }
  );
}

function registerIpc() {
  ipcMain.handle('settings:get', () => settingsStore.getPublic());
  ipcMain.handle('settings:save', (_e, patch) => settingsStore.save(patch));

  ipcMain.handle('keys:test', async () => {
    const s = settingsStore.get();
    const out = { sarvam: null, anthropic: null, kenpath: null };
    await Promise.all([
      s.sarvamKey && sarvam.testKey(s.sarvamKey).then((r) => (out.sarvam = r)),
      s.anthropicKey && translator.testKey(s.anthropicKey, s.claudeModel).then((r) => (out.anthropic = r)),
      s.kenpathKey && kenpath.testKey(s.kenpathKey).then((r) => (out.kenpath = r)),
    ]);
    return out;
  });

  ipcMain.handle('stt:transcribe', async (_e, { wav, withTimestamps }) => {
    const s = settingsStore.get();
    const buf = Buffer.from(wav);
    const r = await sarvam.transcribe(s, buf, { withTimestamps });
    usage.addSarvamStt(Math.max(0, buf.length - 44) / 32000); // 16 kHz mono 16-bit
    return r;
  });

  ipcMain.handle('translate:lines', async (_e, { lines, context, live }) => {
    const s = settingsStore.get();
    const res = await translator.translateLines(s, lines, context || [], { live: !!live });
    if (res.usage) usage.addClaude(res.usage.model, res.usage);
    if (res.sarvamChars) usage.addSarvamTranslate(res.sarvamChars);
    delete res.usage;
    delete res.sarvamChars;
    return res;
  });

  ipcMain.handle('tts:speak', async (_e, { text, gender }) => {
    const s = settingsStore.get();
    const chars = String(text || '').length;
    // returns ArrayBuffer-able Buffers (wav)
    if (kenpath.isKenpathModel(s.ttsModel) && (s.kenpathKey || !s.sarvamKey)) {
      const out = await kenpath.speak(s, text, gender);
      usage.addKenpath(chars, kenpath.lastRemainingChars());
      return out;
    }
    // Kenpath voice chosen but no Kenpath key yet: speak with Sarvam's default voices.
    const ss = kenpath.isKenpathModel(s.ttsModel) ? { ...s, ttsModel: 'bulbul:v3', voiceFemale: 'kavya', voiceMale: 'rahul' } : s;
    const out = await sarvam.speak(ss, text, gender);
    usage.addSarvamTts(ss.ttsModel, chars);
    return out;
  });

  ipcMain.handle('usage:get', () => ({ ...usage.summary(), keys: settingsStore.getPublic(), claudeModel: settingsStore.get().claudeModel }));
  ipcMain.handle('usage:reset', () => usage.reset());

  ipcMain.handle('file:open-media', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Choose a Tamil episode (audio or video)',
      properties: ['openFile'],
      filters: [
        { name: 'Audio / Video', extensions: ['mp4', 'mkv', 'mov', 'm4v', 'avi', 'ts', 'webm', 'mp3', 'wav', 'm4a', 'aac', 'ogg', 'opus', 'flac', 'wma'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    const p = r.filePaths[0];
    openedFiles.add(p);
    return { path: p, name: path.basename(p), size: fs.statSync(p).size, url: pathToFileURL(p).href };
  });

  // A file dropped onto the window.
  const MEDIA_EXT = /\.(mp3|wav|m4a|aac|ogg|opus|flac|webm|mp4|mkv|mov|m4v|avi|ts|wma|amr)$/i;
  ipcMain.handle('file:open-path', (_e, p) => {
    if (!p || !MEDIA_EXT.test(p) || !fs.existsSync(p)) return null;
    openedFiles.add(p);
    return { path: p, name: path.basename(p), size: fs.statSync(p).size, url: pathToFileURL(p).href };
  });

  // Re-open the episode file a saved project came from (if it is still there).
  ipcMain.handle('file:relink', (_e, p) => {
    if (!p || !fs.existsSync(p)) return null;
    openedFiles.add(p);
    return { path: p, name: path.basename(p), size: fs.statSync(p).size, url: pathToFileURL(p).href };
  });

  // Decode the episode's sound to 16 kHz mono. Uses bundled ffmpeg; if that fails
  // the raw bytes are sent so the window can try its own decoder.
  ipcMain.handle('file:decode-audio', async (_e, p) => {
    if (!openedFiles.has(p)) throw new Error('File was not opened through the app');
    try {
      return { pcm: await media.extractPcm16k(p) };
    } catch (err) {
      if (fs.statSync(p).size > 400 * 1024 ** 2) throw new Error('Could not read the sound from this file: ' + err.message);
      return { bytes: fs.readFileSync(p), ffmpegError: err.message };
    }
  });

  ipcMain.handle('file:save', async (_e, { defaultName, filters, data, encoding }) => {
    const r = await dialog.showSaveDialog(win, { defaultPath: defaultName, filters });
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, encoding === 'binary' ? Buffer.from(data) : data, encoding === 'binary' ? undefined : 'utf8');
    return r.filePath;
  });

  ipcMain.handle('file:reveal', (_e, p) => shell.showItemInFolder(p));

  // Projects (autosaved episode work) live in the app's data folder.
  ipcMain.handle('project:save', (_e, project) => projects.save(project));
  // Last-moment save when the window is closing (synchronous so nothing is lost).
  ipcMain.on('project:save-sync', (e, project) => {
    try {
      e.returnValue = projects.save(project);
    } catch {
      e.returnValue = false;
    }
  });
  ipcMain.handle('project:list', () => projects.list());
  ipcMain.handle('project:load', (_e, id) => projects.load(id));
  ipcMain.handle('project:delete', (_e, id) => projects.remove(id));

  ipcMain.handle('mic:ensure', async () => {
    if (process.platform === 'darwin') {
      const st = systemPreferences.getMediaAccessStatus('microphone');
      if (st !== 'granted') return systemPreferences.askForMediaAccess('microphone');
    }
    return true;
  });

  ipcMain.handle('app:info', () => ({ version: app.getVersion(), platform: process.platform }));
}

// Only one copy of the app: a second launch just brings the open window forward.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
}

app.whenReady().then(() => {
  if (!app.hasSingleInstanceLock()) return;
  settingsStore.init(app.getPath('userData'));
  projects.init(app.getPath('userData'));
  usage.init(app.getPath('userData'));
  setupMediaPermissions();
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
