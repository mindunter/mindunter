'use strict';
const { app, BrowserWindow, ipcMain, dialog, session, desktopCapturer, systemPreferences, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const settingsStore = require('./settings');
const sarvam = require('./sarvam');
const translator = require('./translator');
const media = require('./media');
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
    minWidth: 980,
    minHeight: 640,
    title: 'Anuvaada — Tamil → Kannada',
    backgroundColor: '#14121a',
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
    const out = { sarvam: null, anthropic: null };
    if (s.sarvamKey) out.sarvam = await sarvam.testKey(s.sarvamKey);
    if (s.anthropicKey) out.anthropic = await translator.testKey(s.anthropicKey);
    return out;
  });

  ipcMain.handle('stt:transcribe', async (_e, { wav, withTimestamps }) => {
    const s = settingsStore.get();
    return sarvam.transcribe(s, Buffer.from(wav), { withTimestamps });
  });

  ipcMain.handle('translate:lines', async (_e, { lines, context, live }) => {
    const s = settingsStore.get();
    return translator.translateLines(s, lines, context || [], { live: !!live });
  });

  ipcMain.handle('tts:speak', async (_e, { text, gender }) => {
    const s = settingsStore.get();
    return sarvam.speak(s, text, gender); // returns ArrayBuffer-able Buffer (wav)
  });

  ipcMain.handle('file:open-media', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Choose a Tamil episode (audio or video)',
      properties: ['openFile'],
      filters: [
        { name: 'Audio / Video', extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'opus', 'flac', 'webm', 'mp4', 'mkv', 'mov', 'm4v'] },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    const p = r.filePaths[0];
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
      if (fs.statSync(p).size > 1.5 * 1024 ** 3) throw new Error('Could not read the sound from this file: ' + err.message);
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
  const projectsDir = () => {
    const d = path.join(app.getPath('userData'), 'projects');
    fs.mkdirSync(d, { recursive: true });
    return d;
  };
  const safeId = (id) => String(id).replace(/[^a-zA-Z0-9_-]/g, '');
  ipcMain.handle('project:save', (_e, project) => {
    fs.writeFileSync(path.join(projectsDir(), safeId(project.id) + '.json'), JSON.stringify(project));
    return true;
  });
  // Last-moment save when the window is closing (synchronous so nothing is lost).
  ipcMain.on('project:save-sync', (e, project) => {
    try {
      fs.writeFileSync(path.join(projectsDir(), safeId(project.id) + '.json'), JSON.stringify(project));
      e.returnValue = true;
    } catch {
      e.returnValue = false;
    }
  });
  ipcMain.handle('project:list', () => {
    return fs
      .readdirSync(projectsDir())
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try {
          const p = JSON.parse(fs.readFileSync(path.join(projectsDir(), f), 'utf8'));
          return { id: p.id, name: p.name, updatedAt: p.updatedAt, lines: (p.lines || []).length };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  });
  ipcMain.handle('project:load', (_e, id) => {
    const f = path.join(projectsDir(), safeId(id) + '.json');
    return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
  });
  ipcMain.handle('project:delete', (_e, id) => {
    const f = path.join(projectsDir(), safeId(id) + '.json');
    if (fs.existsSync(f)) fs.unlinkSync(f);
    return true;
  });

  ipcMain.handle('mic:ensure', async () => {
    if (process.platform === 'darwin') {
      const st = systemPreferences.getMediaAccessStatus('microphone');
      if (st !== 'granted') return systemPreferences.askForMediaAccess('microphone');
    }
    return true;
  });

  ipcMain.handle('app:info', () => ({ version: app.getVersion(), platform: process.platform }));
}

app.whenReady().then(() => {
  settingsStore.init(app.getPath('userData'));
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
