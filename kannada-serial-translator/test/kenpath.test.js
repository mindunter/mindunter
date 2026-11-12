const test = require('node:test');
const assert = require('node:assert');

process.env.KENPATH_BASE_URL = 'http://127.0.0.1:4559';
const mock = require('./mock-servers');
const kenpath = require('../src/main/kenpath');
const base = { kenpathKey: 'test-kenpath', voiceFemale: 'sv_eh86y5gc', voiceMale: 'sv_msznkuah', voiceAuto: true, pace: 1.8 };

let srv;
test.before(async () => { srv = await mock.start(4559); });
test.after(() => srv.close());

test('Kenpath speaks Kannada as WAV with the voice chosen by gender', async () => {
  const female = await kenpath.speak(base, 'ಅಮ್ಮಾ, ನಾನು ಬಂದೆ.', 'female');
  const male = await kenpath.speak(base, 'ಸರಿ, ಊಟ ಮಾಡು.', 'male');
  assert.strictEqual(female.length, 1);
  assert.strictEqual(female[0].toString('ascii', 0, 4), 'RIFF');
  const [a, b] = mock.calls.kenpathBodies.slice(-2);
  assert.strictEqual(a.voice, 'sv_eh86y5gc');
  assert.strictEqual(b.voice, 'sv_msznkuah');
  assert.strictEqual(a.lang, 'kn');
  assert.strictEqual(a.speed, 1.5); // clamped to Kenpath's range
  assert.ok(male[0].length > 44);
});

test('Sarvam voice IDs left in settings fall back to Kenpath defaults', async () => {
  await kenpath.speak({ ...base, voiceFemale: 'kavya', voiceAuto: false }, 'ನಮಸ್ಕಾರ', 'male');
  assert.strictEqual(mock.calls.kenpathBodies.at(-1).voice, kenpath.DEFAULT_FEMALE);
});

test('rejected Kenpath key gives a clear message', async () => {
  await assert.rejects(kenpath.speak({ ...base, kenpathKey: 'nope' }, 'ನಮಸ್ಕಾರ', 'female'), /Kenpath Labs key was rejected/);
  assert.deepStrictEqual(await kenpath.testKey('test-kenpath'), { ok: true });
  assert.strictEqual((await kenpath.testKey('nope')).ok, false);
});
