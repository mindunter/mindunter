const test = require('node:test');
const assert = require('node:assert');
const A = require('../src/renderer/audio.js');
const { splitText } = require('../src/main/sarvam.js');

// synthetic "dialogue": tone bursts (speech) separated by pauses
function dialogue(pattern, sr = 16000) {
  const total = pattern.reduce((n, [, d]) => n + d, 0);
  const out = new Float32Array(Math.round(total * sr));
  let o = 0;
  for (const [on, d] of pattern) {
    const n = Math.round(d * sr);
    for (let i = 0; i < n; i++) out[o + i] = on ? 0.3 * Math.sin((2 * Math.PI * 220 * i) / sr) : (Math.random() - 0.5) * 0.002;
    o += n;
  }
  return out;
}

test('segments stay within 30 s and cut inside pauses', () => {
  const pat = [];
  for (let i = 0; i < 40; i++) pat.push([1, 3 + (i % 4)], [0, 0.7]);
  const s = dialogue(pat);
  const segs = A.segmentBySilence(s);
  assert.ok(segs.length > 5);
  let prevEnd = 0;
  for (const g of segs) {
    assert.strictEqual(g.start, prevEnd, 'contiguous');
    assert.ok((g.end - g.start) / 16000 <= 25.01, 'max length');
    prevEnd = g.end;
    if (g.end < s.length) {
      // the cut point must be quiet
      let e = 0;
      for (let i = g.end - 160; i < g.end + 160; i++) e += Math.abs(s[i]);
      assert.ok(e / 320 < 0.05, 'cut at a pause');
    }
  }
  assert.strictEqual(prevEnd, s.length);
});

test('silence-only pieces are flagged', () => {
  const s = dialogue([[0, 30], [1, 4], [0, 1]]);
  const segs = A.segmentBySilence(s);
  assert.ok(segs.some((g) => !g.speech));
  assert.ok(segs.some((g) => g.speech));
});

test('WAV header is valid 16 kHz mono PCM', () => {
  const buf = Buffer.from(A.encodeWav(new Float32Array(16000), 16000));
  assert.strictEqual(buf.toString('ascii', 0, 4), 'RIFF');
  assert.strictEqual(buf.toString('ascii', 8, 12), 'WAVE');
  assert.strictEqual(buf.readUInt32LE(24), 16000);
  assert.strictEqual(buf.readUInt16LE(22), 1);
  assert.strictEqual(buf.length, 44 + 32000);
});

test('live segmenter emits a chunk per spoken line and skips silence', () => {
  const chunks = [];
  const seg = new A.LiveSegmenter((c) => chunks.push(c.length / 16000));
  const s = dialogue([[0, 3], [1, 3], [0, 1], [1, 4], [0, 1], [0, 5]]);
  for (let i = 0; i < s.length; i += 128) seg.push(s.subarray(i, i + 128));
  seg.flush();
  assert.strictEqual(chunks.length, 2, JSON.stringify(chunks));
  for (const c of chunks) assert.ok(c >= 2.5 && c <= 12);
});

test('long monologue is force-cut at maxSec', () => {
  const chunks = [];
  const seg = new A.LiveSegmenter((c) => chunks.push(c.length / 16000));
  const s = dialogue([[1, 30]]);
  for (let i = 0; i < s.length; i += 128) seg.push(s.subarray(i, i + 128));
  assert.ok(chunks.length >= 2);
  assert.ok(chunks.every((c) => c <= 12.05));
});

test('splitText respects limits on sentence boundaries', () => {
  const t = Array.from({ length: 50 }, (_, i) => `ಇದು ವಾಕ್ಯ ಸಂಖ್ಯೆ ${i}.`).join(' ');
  const parts = splitText(t, 120);
  assert.ok(parts.length > 1);
  assert.ok(parts.every((p) => p.length <= 120));
  assert.strictEqual(parts.join(' '), t);
});
