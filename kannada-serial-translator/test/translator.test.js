const test = require('node:test');
const assert = require('node:assert');
const http = require('http');

process.env.SARVAM_BASE_URL = 'http://127.0.0.1:4557';
const mock = require('./mock-servers');
const translator = require('../src/main/translator');
const sarvam = require('../src/main/sarvam');
const base = { sarvamKey: 'test-sarvam', kannadaStyle: 'bengaluru', glossary: 'மீனா = ಮೀನಾ', translationEngine: 'auto' };
const lines = [{ id: 'L1', ta: 'அம்மா, நான் வந்துட்டேன்.' }, { id: 'L2', ta: 'நீ எங்க போயிருந்த?' }];

let srv, bad;
test.before(async () => {
  srv = await mock.start(4557);
  bad = http.createServer((req, res) => { res.writeHead(401, { 'content-type': 'application/json' }); res.end('{"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}'); });
  await new Promise((r) => bad.listen(4558, r));
});
test.after(() => { srv.close(); bad.close(); });

test('Claude path returns Kannada + gender, prompt carries glossary', async () => {
  process.env.ANTHROPIC_BASE_URL = 'http://127.0.0.1:4557';
  const r = await translator.translateLines({ ...base, anthropicKey: 'test-claude' }, lines, [{ ta: 'x', kn: 'y' }], { live: false });
  assert.strictEqual(r.engine, 'claude');
  assert.deepStrictEqual(r.lines.map((l) => l.kn), ['ಅಮ್ಮಾ, ನಾನು ಬಂದೆ.', 'ನೀನು ಎಲ್ಲಿಗೆ ಹೋಗಿದ್ದೆ?']);
  assert.strictEqual(r.lines[0].gender, 'male');
  assert.strictEqual(r.lines[0].ta, undefined); // unchanged Tamil is not echoed back
  assert.strictEqual(r.lines[1].ta, 'நீ எங்க போயிருந்த?!'); // corrected Tamil is returned
  const body = mock.calls.claudeBodies.at(-1);
  assert.match(body.system[0].text, /ಮೀನಾ/);
  assert.strictEqual(body.model, 'claude-haiku-5-5');
});

test('no Claude key -> Sarvam translator', async () => {
  const r = await translator.translateLines({ ...base, anthropicKey: '' }, lines, []);
  assert.strictEqual(r.engine, 'sarvam');
  assert.strictEqual(r.lines[0].kn, 'ಸಾರ್ವಂ ಅನುವಾದ');
});

test('rejected Claude key is reported, not silently swapped', async () => {
  process.env.ANTHROPIC_BASE_URL = 'http://127.0.0.1:4558';
  await assert.rejects(translator.translateLines({ ...base, anthropicKey: 'k2' }, lines, []), /Claude API key was rejected/);
});

test('Claude unreachable -> falls back to Sarvam with a warning', async () => {
  process.env.ANTHROPIC_BASE_URL = 'http://127.0.0.1:4599';
  const r = await translator.translateLines({ ...base, anthropicKey: 'k3' }, lines, []);
  assert.strictEqual(r.engine, 'sarvam');
  assert.match(r.warning, /Claude translation failed/);
});

test('bad Sarvam key gives a clear message', async () => {
  await assert.rejects(sarvam.transcribe({ sarvamKey: 'nope' }, Buffer.alloc(100)), /Sarvam API key was rejected/);
});
