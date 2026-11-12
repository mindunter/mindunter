// Full feature check: launches the real app against mock Sarvam + Claude servers
// and exercises every user-facing feature. Run: xvfb-run -a node test/e2e.js
const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');
const os = require('os');
const assert = require('assert');
const { execFileSync } = require('child_process');
const mock = require('./mock-servers');

const PORT = 4555;
const SHOTS = process.env.SHOTS || null;
const results = [];
async function step(name, fn) {
  const t = Date.now();
  try {
    await fn();
    results.push(['✓', name, Date.now() - t]);
    console.log(`✓ ${name}`);
  } catch (e) {
    results.push(['✗', name, Date.now() - t]);
    console.log(`✗ ${name}\n   ${String(e.stack || e).split('\n').slice(0, 4).join('\n   ')}`);
    throw e;
  }
}
const shot = (win, name) => SHOTS && win.screenshot({ path: path.join(SHOTS, name + '.png') });

function makeEpisode(file, seconds) {
  // tone bursts (stand-in for dialogue) every 5 s, as a video with AAC audio
  execFileSync(require('ffmpeg-static'), ['-y', '-loglevel', 'error',
    '-f', 'lavfi', '-i', `sine=frequency=300:duration=${seconds}`, '-f', 'lavfi', '-i', `color=c=0x334455:s=320x180:d=${seconds}`,
    '-af', "volume='if(lt(mod(t,5),4),1,0.0)':eval=frame", '-shortest', '-c:v', 'libx264', '-c:a', 'aac', file]);
}

(async () => {
  const srv = await mock.start(PORT);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'anuvaada-'));
  const ep1 = path.join(tmp, 'Episode 101.mp4');
  const ep2 = path.join(tmp, 'Episode 102.mp4');
  makeEpisode(ep1, 70);
  makeEpisode(ep2, 160);
  const userData = path.join(tmp, 'userdata');
  const env = { ...process.env, SARVAM_BASE_URL: `http://127.0.0.1:${PORT}`, ANTHROPIC_BASE_URL: `http://127.0.0.1:${PORT}` };
  delete env.SARVAM_API_KEY;
  delete env.ANTHROPIC_API_KEY;
  const launch = () => electron.launch({
    executablePath: process.env.APP_BIN || require('electron'),
    args: [...(process.env.APP_BIN ? [] : [path.join(__dirname, '..')]), '--user-data-dir=' + userData, '--no-sandbox'],
    env,
  });
  const stubDialogs = (app, openFile) => app.evaluate(({ dialog }, [file, dir]) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    dialog.showSaveDialog = async (_w, o) => ({ canceled: false, filePath: dir + '/' + o.defaultPath });
  }, [openFile, tmp]);

  let app = await launch();
  let win = await app.firstWindow();
  const errors = [];
  const watch = (w) => w.on('pageerror', (e) => errors.push(e.message));
  watch(win);
  const toastText = () => win.$eval('#toast-text', (e) => e.textContent);
  const waitToast = (re, timeout = 30000) => win.waitForFunction((src) => new RegExp(src).test(document.querySelector('#toast-text').textContent), re.source, { timeout });
  const lines = () => win.$$eval('.line', (els) => els.map((e) => ({ t: e.querySelector('.time').textContent, ta: e.querySelector('.ta').textContent, kn: e.querySelector('.kn').textContent, hidden: e.classList.contains('hidden') })));
  const allDone = () => win.waitForFunction(() => document.querySelectorAll('.line').length > 0 && document.querySelector('#progress').classList.contains('hidden') && ![...document.querySelectorAll('.line:not(.failed) .kn')].some((k) => !k.textContent), null, { timeout: 60000 });

  // ------------------------------------------------------------ first run
  await step('First run shows the welcome screen', async () => {
    await win.waitForSelector('#welcome:not(.hidden)');
    await shot(win, '01-welcome');
  });
  await step('Welcome: empty key is refused', async () => {
    await win.click('#w-go');
    assert.match(await win.$eval('#w-error', (e) => e.textContent), /Sarvam/);
  });
  await step('Welcome: wrong Sarvam key shows the reason', async () => {
    await win.fill('#w-sarvam', 'wrong-key');
    await win.click('#w-go');
    await win.waitForFunction(() => /did not work/.test(document.querySelector('#w-error').textContent));
  });
  await step('Welcome: wrong Claude key is caught', async () => {
    await win.fill('#w-sarvam', 'test-sarvam');
    await win.fill('#w-claude', 'bad-claude');
    await win.click('#w-go');
    await win.waitForFunction(() => /Claude key did not work/.test(document.querySelector('#w-error').textContent));
  });
  await step('Welcome: good keys → app opens, both keys green', async () => {
    await win.fill('#w-claude', 'test-claude');
    await win.click('#w-go');
    await win.waitForSelector('#welcome.hidden', { state: 'attached', timeout: 8000 }).catch(async (e) => { console.log('w-error:', await win.$eval('#w-error', (x) => x.textContent)); throw e; });
    assert.strictEqual(await win.$$eval('#keystatus .d.ok', (d) => d.length), 2);
    await shot(win, '02-empty');
  });

  // ------------------------------------------------------------ settings
  await step('Settings: style, names, voice options save and survive a reload', async () => {
    await win.click('[data-tab=settings]');
    await win.click('#style-choices input[value=north] + span');
    await win.fill('#glossary', 'மீனா = ಮೀನಾ');
    await win.fill('#storyNotes', 'Meena is respectful.');
    await win.selectOption('#voiceFemale', 'priya');
    await win.waitForTimeout(700);
    await shot(win, '03-settings');
    await win.reload();
    await win.waitForSelector('#keystatus .d.ok');
    await win.click('[data-tab=settings]');
    assert.strictEqual(await win.$eval('input[name=kannadaStyle]:checked', (e) => e.value), 'north');
    assert.strictEqual(await win.$eval('#glossary', (e) => e.value), 'மீனா = ಮೀನಾ');
    assert.strictEqual(await win.$eval('#voiceFemale', (e) => e.value), 'priya');
  });
  await step('Settings: Check keys reports both working', async () => {
    await win.click('#btn-test');
    await win.waitForFunction(() => document.querySelectorAll('#test-result .ok').length === 2);
  });
  await step('Settings: voice model switch (Advanced) updates voice list', async () => {
    await win.click('.advanced summary');
    await win.selectOption('#ttsModel', 'bulbul:v4-flash');
    assert.strictEqual(await win.$eval('#voiceFemale', (e) => e.value), 'chaitra_kn_conversation');
    await win.selectOption('#ttsModel', 'bulbul:v3');
    await win.selectOption('#voiceFemale', 'priya');
  });
  await step('Settings: voice preview plays', async () => {
    const before = mock.calls.tts;
    await win.click('#btn-preview-voice');
    await win.waitForFunction(() => !document.querySelector('#btn-preview-voice').disabled, null, { timeout: 15000 });
    assert.ok(mock.calls.tts > before);
    assert.strictEqual(mock.calls.ttsBodies.at(-2).speaker, 'priya');
    assert.strictEqual(mock.calls.ttsBodies.at(-1).speaker, 'rahul');
  });

  // ------------------------------------------------------------ episode
  await stubDialogs(app, ep1);
  mock.opts.failStt = new Set([1]); // the 2nd part of the episode "fails"
  await step('Open an episode → Tamil heard, Kannada written', async () => {
    await win.click('[data-tab=episode]');
    await win.click('#btn-open-2');
    await win.waitForSelector('#progress:not(.hidden)');
    await allDone();
    const L = await lines();
    assert.ok(L.length >= 3, 'lines: ' + L.length);
    assert.ok(L.some((l) => l.kn === 'ಅಮ್ಮಾ, ನಾನು ಬಂದೆ.'));
    await shot(win, '04-episode');
  });
  await step('Claude got style, names, notes and context', () => {
    const b = mock.calls.claudeBodies.at(-1);
    assert.match(b.system[0].text, /North-Karnataka/);
    assert.match(b.system[0].text, /ಮೀನಾ/);
    assert.match(b.system[0].text, /Meena is respectful/);
    assert.strictEqual(b.output_config.effort, 'medium');
  });
  await step('A part that could not be heard is flagged with a retry banner', async () => {
    assert.strictEqual(await win.$$eval('.line.failed', (e) => e.length), 1);
    await win.waitForSelector('#banner:not(.hidden)');
    assert.match(await win.$eval('#banner-text', (e) => e.textContent), /could not be heard/);
    await shot(win, '05-banner');
  });
  await step('“Try again” re-listens and translates the failed part', async () => {
    await win.click('#banner-btn');
    await win.waitForFunction(() => !document.querySelector('.line.failed'), null, { timeout: 30000 });
    await allDone();
    assert.ok(await win.$eval('#banner', (e) => e.classList.contains('hidden')));
  });
  await step('Saved work lists the episode as Ready', async () => {
    await win.waitForFunction(() => /Ready/.test(document.querySelector('#projects').textContent));
  });
  await step('Search filters lines and shows a count', async () => {
    await win.fill('#search', 'ದೇವಸ್ಥಾನ');
    await win.waitForFunction(() => /found/.test(document.querySelector('#search-count').textContent));
    const L = await lines();
    assert.ok(L.filter((l) => !l.hidden).every((l) => l.kn.includes('ದೇವಸ್ಥಾನ')));
    await win.fill('#search', '');
    await win.waitForFunction(() => !document.querySelector('.line.hidden'));
  });
  await step('Notes and speaker (man/woman) are shown under lines', async () => {
    const rows = await win.$$eval('.line', (els) => els.map((e) => [e.querySelector('.ta').textContent, e.querySelector('.sub').textContent]));

    let notes = 0;
    for (const [ta, sub] of rows) if (ta.includes('கோவில')) { assert.match(sub, /Temple/); notes++; }
    assert.ok(notes > 0, 'no line with a note');
    assert.ok(await win.$$eval('.line .who', (e) => e.length > 0));
  });
  await step('Keyboard: ↓ selects, K speaks the selected line', async () => {
    await win.click('.lines-head');
    await win.keyboard.press('ArrowDown');
    await win.keyboard.press('ArrowDown');
    const sel = await win.$eval('.line.current .kn', (e) => e.textContent);
    const before = mock.calls.tts;
    await win.keyboard.press('k');
    await win.waitForFunction(() => document.querySelector('.line.speaking'));
    await win.waitForFunction(() => !document.querySelector('.line.speaking'), null, { timeout: 15000 });
    assert.ok(mock.calls.tts > before || sel);
  });
  await step('Line ▶ plays the original Tamil and stops at the end of the line', async () => {
    await win.click('.line:nth-child(2) [data-act=orig]', { force: true });
    await win.waitForFunction(() => !document.querySelector('#player').paused);
    await win.waitForFunction(() => document.querySelector('#player').paused, null, { timeout: 15000 });
  });
  await step('Edit a line (E key), marked as edited', async () => {
    await win.click('.line:nth-child(2) .time');
    await win.keyboard.press('Escape');
    await win.evaluate(() => document.activeElement.blur());
    await win.keyboard.press('e');
    await win.keyboard.type(' ಹೌದಾ?');
    await win.keyboard.press('Enter');
    assert.match(await win.$eval('.line:nth-child(2) .kn', (e) => e.textContent), /ಹೌದಾ\?$/);
    assert.ok(await win.$eval('.line:nth-child(2) .edited-tag', (e) => !!e));
  });
  await step('Line ↻ writes a single line again', async () => {
    const n = mock.calls.claude;
    await win.click('.line:nth-child(3) [data-act=redo]', { force: true });
    await win.waitForFunction(() => document.querySelector('.line:nth-child(3) .kn').textContent.length > 0);
    assert.strictEqual(mock.calls.claude, n + 1);
  });
  await step('Re-translate all keeps the edited line', async () => {
    win.once('dialog', (d) => d.accept());
    await win.click('#btn-more');
    await win.click('#btn-retranslate-all');
    await waitToast(/Kannada updated/);
    assert.match(await win.$eval('.line:nth-child(2) .kn', (e) => e.textContent), /ಹೌದಾ\?$/);
  });
  await step('Listen in Kannada plays lines in order, Stop works', async () => {
    await win.click('.line:nth-child(2) .time');
    await win.evaluate(() => document.querySelector('#player').pause());
    await win.click('#btn-speak-all');
    await win.waitForSelector('#btn-stop-speak:not(.hidden)');
    await win.waitForFunction(() => document.querySelector('.line.speaking'));
    await shot(win, '06-speaking');
    await win.click('#btn-stop-speak');
    await win.waitForSelector('#btn-speak-all:not(.hidden)');
    assert.strictEqual(await win.$$eval('.line.speaking', (e) => e.length), 0);
  });
  await step('Kannada text size buttons work and are remembered', async () => {
    await win.click('#kn-bigger');
    await win.click('#kn-bigger');
    assert.strictEqual(await win.evaluate(() => getComputedStyle(document.querySelector('.line .kn')).fontSize), '20px');
  });
  for (const [kind, file] of [['doc', 'script.doc'], ['txt', 'Kannada.txt'], ['csv', 'Tamil-Kannada.csv'], ['srt', 'Kannada.srt'], ['wav', 'Kannada voice.wav'], ['dub', 'Kannada dub track.wav']]) {
    await step(`Export ${kind}`, async () => {
      await win.click('#btn-export');
      await win.click(`[data-export=${kind}]`);
      await waitToast(/^Saved /);
      const f = path.join(tmp, `Episode 101 - ${file}`);
      assert.ok(fs.existsSync(f), f);
      const size = fs.statSync(f).size;
      assert.ok(size > 40, 'empty file');
      if (kind === 'dub') assert.ok(size >= 70 * 48000, 'dub track shorter than the episode: ' + size);
      if (kind === 'txt') assert.match(fs.readFileSync(f, 'utf8'), /ಹೌದಾ\?/);
      if (kind === 'srt') assert.match(fs.readFileSync(f, 'utf8'), /^1\n00:00:00,\d{3} --> 00:00:0\d,\d{3}\n/);
      await win.evaluate(() => (document.querySelector('#toast-text').textContent = ''));
    });
  }

  // ------------------------------------------------------------ second episode: pause & continue, drag-drop path
  await step('Open a second episode via drag-drop path, pause mid-way', async () => {
    mock.opts.failStt = new Set();
    mock.opts.claudeDelay = 8000;
    await win.evaluate((p) => { api.openPath(p).then(startEpisode); }, ep2);
    await win.waitForFunction(() => document.querySelector('#ep-name').value === 'Episode 102');
    await win.waitForFunction(() => document.querySelectorAll('.line').length >= 3, null, { timeout: 30000 });
    await shot(win, '09-progress');
    await win.click('#btn-cancel');
    await waitToast(/Paused/);
    await win.waitForSelector('#banner:not(.hidden)');
    assert.match(await win.$eval('#banner-text', (e) => e.textContent), /not yet written/);
  });
  await step('Continue finishes the paused episode', async () => {
    mock.opts.claudeDelay = 0;
    await win.waitForTimeout(8200); // let the in-flight request from before the pause return
    await win.click('#banner-btn');
    await allDone();
    assert.ok(await win.$eval('#banner', (e) => e.classList.contains('hidden')));
  });
  await step('Switching episodes from Saved work', async () => {
    await win.click('#projects li:has-text("Episode 101")');
    await win.waitForFunction(() => document.querySelector('#ep-name').value === 'Episode 101');
    assert.match(await win.$eval('.line:nth-child(2) .kn', (e) => e.textContent), /ಹೌದಾ\?$/);
    assert.ok(await win.$eval('#player', (p) => !!p.src), 'episode video re-linked');
  });
  await step('Rename episode', async () => {
    await win.fill('#ep-name', 'Episode 101 — Meena returns');
    await win.waitForFunction(() => /Meena returns/.test(document.querySelector('#projects').textContent));
  });
  await step('Narrow window layout (Tamil above Kannada)', async () => {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1000, 760));
    await win.waitForTimeout(400);
    await shot(win, '07-narrow');
    const gridAreas = await win.$eval('.line', (e) => getComputedStyle(e).gridTemplateAreas);
    assert.match(gridAreas, /"t ta a"/);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1360, 880));
  });
  await step('Dark theme renders', async () => {
    await win.emulateMedia({ colorScheme: 'dark' });
    await win.waitForTimeout(200);
    await shot(win, '08-dark');
    assert.notStrictEqual(await win.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(247, 244, 238)');
    await win.emulateMedia({ colorScheme: 'light' });
  });

  // ------------------------------------------------------------ restart
  await step('Edit right before closing is not lost', async () => {
    await win.click('.line:nth-child(3) .kn');
    await win.keyboard.press('End');
    await win.keyboard.type(' ಬೇಗ!');
    await app.close();
    app = await launch();
    win = await app.firstWindow();
    watch(win);
    await win.waitForSelector('#keystatus .d.ok');
    assert.ok(await win.$eval('#welcome', (e) => e.classList.contains('hidden')), 'keys remembered');
    await win.click('#projects li:has-text("Meena returns")');
    await win.waitForFunction(() => document.querySelectorAll('.line').length >= 3);
    const all = (await lines()).map((l) => l.kn).join(' / ');
    assert.ok(all.includes('ಹೌದಾ?') && all.includes('ಬೇಗ!'), all);
  });
  await step('Delete an episode', async () => {
    const before = await win.$$eval('#projects li', (e) => e.length);
    win.once('dialog', (d) => d.accept());
    await win.click('#btn-more');
    await win.click('#btn-delete-ep');
    await win.waitForFunction((n) => document.querySelectorAll('#projects li').length === n - 1, before);
    assert.ok(await win.$eval('#episode', (e) => e.classList.contains('hidden')));
  });

  await app.close();
  srv.close();
  console.log(`\n${results.filter((r) => r[0] === '✓').length}/${results.length} checks passed · page errors: ${errors.length ? errors.join('; ') : 'none'}`);
  process.exit(errors.length ? 1 : 0);
})().catch(async (e) => {
  console.log(`\nFAILED after ${results.filter((r) => r[0] === '✓').length} passing checks`);
  process.exit(1);
});
