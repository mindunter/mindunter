// Live mode with a simulated microphone that "plays" three spoken lines.
const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
const mock = require('./mock-servers');

(async () => {
  const srv = await mock.start(4556);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anuvaada-live-'));
  const wav = path.join(tmp, 'mic.wav');
  execFileSync(require('ffmpeg-static'), ['-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=260:duration=16',
    '-af', "volume='if(lt(mod(t,4),3),1,0.0)':eval=frame", '-ar', '48000', '-ac', '1', wav]);
  const app = await electron.launch({
    executablePath: process.env.APP_BIN || require('electron'),
    args: [...(process.env.APP_BIN ? [] : [path.join(__dirname, '..')]), '--user-data-dir=' + path.join(tmp, 'ud'), '--no-sandbox',
      '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-file-for-fake-audio-capture=' + wav],
    env: { ...process.env, SARVAM_BASE_URL: 'http://127.0.0.1:4556', ANTHROPIC_BASE_URL: 'http://127.0.0.1:4556', SARVAM_API_KEY: 'test-sarvam', ANTHROPIC_API_KEY: 'test-claude' },
  });
  const win = await app.firstWindow();
  const errors = [];
  win.on('pageerror', (e) => errors.push(e.message));
  await win.waitForSelector('#keystatus .pill.ok');
  await win.click('[data-tab=live]');
  await win.click('#live-source [data-src=mic]');
  await win.waitForFunction(() => document.querySelector('#mic-select').options.length > 0);
  await win.check('#live-speak');
  await win.click('#btn-live');
  await win.waitForFunction(() => document.querySelectorAll('.live-item .kn:not(.pending)').length >= 3, null, { timeout: 60000 });
  const items = await win.$$eval('.live-item', (els) => els.map((e) => e.querySelector('.ta').textContent + ' => ' + e.querySelector('.kn').textContent));
  console.log(items.join('\n'));
  await win.screenshot({ path: path.join(process.env.SHOTS || tmp, '5-live-running.png') });
  await win.click('#btn-live');
  await win.click('#btn-live-save');
  await win.waitForFunction(() => /Saved/.test(document.querySelector('#toast').textContent));
  console.log('calls', { stt: mock.calls.stt, claude: mock.calls.claude, tts: mock.calls.tts, liveEffort: mock.calls.claudeBodies.at(-1).output_config.effort });
  console.log('page errors', errors);
  await app.close();
  srv.close();
  process.exit(errors.length || mock.calls.tts < 1 ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
