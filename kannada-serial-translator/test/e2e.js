// End-to-end: launches the real Electron app against the mock APIs, opens a
// generated "episode", waits for Kannada lines, speaks a line, exports files.
const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const mock = require('./mock-servers');

(async () => {
  const srv = await mock.start(4555);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anuvaada-'));
  // 70 s "episode": 4 s tone bursts separated by pauses, as an mp4 video with AAC audio
  const ep = path.join(tmp, 'Episode 101.mp4');
  const ffmpeg = require('ffmpeg-static');
  execFileSync(ffmpeg, ['-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=300:duration=70', '-f', 'lavfi', '-i', 'color=c=navy:s=320x180:d=70',
    '-af', "volume='if(lt(mod(t,5),4),1,0.0)':eval=frame", '-shortest', '-c:v', 'libx264', '-c:a', 'aac', ep]);
  const userData = path.join(tmp, 'userdata');
  const app = await electron.launch({ executablePath: process.env.APP_BIN || require('electron'),
    args: [...(process.env.APP_BIN ? [] : [path.join(__dirname, '..')]), '--user-data-dir=' + userData, '--no-sandbox'],
    env: { ...process.env, SARVAM_BASE_URL: 'http://127.0.0.1:4555', ANTHROPIC_BASE_URL: 'http://127.0.0.1:4555', SARVAM_API_KEY: 'test-sarvam', ANTHROPIC_API_KEY: 'test-claude' },
  });
  const win = await app.firstWindow();
  const errors = [];
  win.on('pageerror', (e) => errors.push(e.message));
  win.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await win.waitForSelector('#keystatus .pill.ok');
  await win.screenshot({ path: path.join(process.env.SHOTS || tmp, '1-start.png') });

  // Stub the native file dialogs
  await app.evaluate(({ dialog }, [file, dir]) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    dialog.showSaveDialog = async (_w, o) => ({ canceled: false, filePath: dir + '/' + o.defaultPath });
  }, [ep, tmp]);

  await win.click('#btn-open');
  await win.waitForFunction(() => document.querySelectorAll('.line').length >= 3 && !document.querySelector('.kn:empty') && document.querySelector('#progress').classList.contains('hidden'), null, { timeout: 60000 });
  const rows = await win.$$eval('.line', (els) => els.map((e) => [e.querySelector('.time').textContent, e.querySelector('.ta').textContent, e.querySelector('.kn').textContent]));
  console.log('lines:', rows.length, 'saved projects now:', fs.readdirSync(path.join(userData, 'projects')), await app.evaluate(({ app }) => app.getPath('userData')));
  console.log(rows.slice(0, 5).map((r) => r.join(' | ')).join('\n'));
  await win.screenshot({ path: path.join(process.env.SHOTS || tmp, '2-episode.png') });

  // Speak one line
  await win.click('.line [data-act=speak]');
  await win.waitForFunction(() => document.querySelector('.line.speaking'));
  await win.waitForFunction(() => !document.querySelector('.line.speaking'), null, { timeout: 15000 });

  // Edit a line, then exports
  await win.click('.line .kn');
  await win.keyboard.press('End');
  await win.keyboard.type(' ಹೌದಾ?');
  for (const kind of ['txt', 'srt', 'csv', 'doc', 'dub']) {
    await win.click('#btn-export');
    await win.click(`[data-export=${kind}]`);
    await win.waitForFunction(() => /^Saved: /.test(document.querySelector('#toast').textContent), null, { timeout: 30000 })
      .catch(async (e) => { console.log('toast:', await win.$eval('#toast', (t) => t.textContent), errors); throw e; });
    await win.evaluate(() => (document.querySelector('#toast').textContent = ''));
  }
  const files = fs.readdirSync(tmp);
  console.log('exported:', files.filter((f) => f.startsWith('Episode 101 -')));
  const txt = fs.readFileSync(path.join(tmp, 'Episode 101 - Kannada.txt'), 'utf8');
  console.log(txt.split('\n').slice(0, 4).join('\n'));
  const dub = fs.statSync(path.join(tmp, 'Episode 101 - Kannada dub track.wav')).size;
  console.log('dub wav bytes', dub, '(~70 s @24k =', 70 * 48000, ')');

  // Settings screen
  await win.click('[data-tab=settings]');
  await win.screenshot({ path: path.join(process.env.SHOTS || tmp, '3-settings.png') });
  await win.click('[data-tab=live]');
  await win.screenshot({ path: path.join(process.env.SHOTS || tmp, '4-live.png') });

  // Edit again and close immediately: the edit must survive
  await win.click('[data-tab=episode]');
  await win.click('.line:nth-of-type(3) .kn');
  await win.keyboard.press('End');
  await win.keyboard.type(' ಬೇಗ!');
  // Restart: project should be listed and reopen with its lines
  await app.close();
  const app2 = await electron.launch({ executablePath: process.env.APP_BIN || require('electron'), args: [...(process.env.APP_BIN ? [] : [path.join(__dirname, '..')]), '--user-data-dir=' + userData, '--no-sandbox'], env: { ...process.env, SARVAM_BASE_URL: 'http://127.0.0.1:4555', ANTHROPIC_BASE_URL: 'http://127.0.0.1:4555', SARVAM_API_KEY: 'test-sarvam' } });
  const w2 = await app2.firstWindow();
  await w2.click('[data-tab=episode]');
  await w2.waitForSelector('#projects li .pname');
  await w2.click('#projects li');
  await w2.waitForFunction(() => document.querySelectorAll('.line').length >= 3);
  const edited = await w2.$$eval('.line .kn', (els) => els.map((e) => e.textContent).join(' / '));
  if (!edited.includes('ಹೌದಾ?') || !edited.includes('ಬೇಗ!')) { console.log('EDIT LOST', edited); process.exit(1); }
  console.log('after restart, first line:', edited, '| keys remembered:', await w2.$eval('#keystatus', (e) => e.textContent));
  await app2.close();
  srv.close();
  console.log('calls', { ...mock.calls, claudeBodies: mock.calls.claudeBodies.length });
  console.log('claude request sample:', JSON.stringify({ model: mock.calls.claudeBodies[0].model, output_config: { effort: mock.calls.claudeBodies[0].output_config.effort, format: mock.calls.claudeBodies[0].output_config.format.type } }));
  console.log('page errors:', errors);
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
