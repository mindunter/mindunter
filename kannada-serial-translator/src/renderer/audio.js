/* Audio utilities shared by the Episode and Live screens.
 * Pure functions are also exported for Node tests (module.exports). */
(function (root) {
  'use strict';

  const SR = 16000; // speech models work best at 16 kHz mono
  const FRAME = 480; // 30 ms frames at 16 kHz

  function frameDb(samples, start, len) {
    let sum = 0;
    const end = Math.min(samples.length, start + len);
    for (let i = start; i < end; i++) sum += samples[i] * samples[i];
    const rms = Math.sqrt(sum / Math.max(1, end - start));
    return 20 * Math.log10(rms + 1e-9);
  }

  function frameLevels(samples) {
    const n = Math.ceil(samples.length / FRAME);
    const db = new Float32Array(n);
    for (let f = 0; f < n; f++) db[f] = frameDb(samples, f * FRAME, FRAME);
    return db;
  }

  function percentile(arr, p) {
    const a = Array.from(arr).sort((x, y) => x - y);
    if (!a.length) return -90;
    return a[Math.min(a.length - 1, Math.max(0, Math.floor(p * (a.length - 1))))];
  }

  /**
   * Cut a long recording into pieces of minSec..maxSec seconds, always cutting
   * in the quietest moment (a pause between dialogue lines) so no word is chopped.
   * Returns [{ start, end, speech }] in samples; speech=false for silence/music-only pieces.
   */
  function segmentBySilence(samples, sr = SR, opts = {}) {
    const minSec = opts.minSec ?? 6;
    const maxSec = opts.maxSec ?? 25;
    const frameSec = FRAME / sr;
    const db = frameLevels(samples);
    const n = db.length;
    // Smooth over ~240 ms so a cut lands in a real pause, not between syllables.
    const W = 4;
    const smooth = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0, c = 0;
      for (let j = Math.max(0, i - W); j <= Math.min(n - 1, i + W); j++) { s += db[j]; c++; }
      smooth[i] = s / c;
    }
    const floor = percentile(db, 0.15);
    const speechThresh = Math.max(floor + 10, -50);
    const minF = Math.round(minSec / frameSec);
    const maxF = Math.round(maxSec / frameSec);
    const out = [];
    let cur = 0;
    while (cur < n) {
      let cut;
      if (n - cur <= maxF) cut = n;
      else {
        let best = cur + maxF, bestScore = Infinity;
        for (let f = cur + minF; f < cur + maxF; f++) {
          // prefer quiet frames; small bias towards longer pieces
          const score = smooth[f] - 2 * ((f - cur) / maxF);
          if (score < bestScore) { bestScore = score; best = f; }
        }
        cut = best;
      }
      let speechFrames = 0;
      for (let f = cur; f < cut; f++) if (db[f] > speechThresh) speechFrames++;
      out.push({
        start: cur * FRAME,
        end: Math.min(samples.length, cut * FRAME),
        speech: speechFrames * frameSec >= 0.4,
      });
      cur = cut;
    }
    return out;
  }

  /** Float32 mono -> 16-bit PCM WAV (ArrayBuffer). */
  function encodeWav(samples, sr = SR) {
    const buf = new ArrayBuffer(44 + samples.length * 2);
    const v = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVE');
    w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    w(36, 'data'); v.setUint32(40, samples.length * 2, true);
    let o = 44;
    for (let i = 0; i < samples.length; i++, o += 2) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return buf;
  }

  /** Light normalisation so quiet recordings are heard clearly by the speech model. */
  function normalize(samples) {
    let peak = 0;
    for (let i = 0; i < samples.length; i++) { const a = Math.abs(samples[i]); if (a > peak) peak = a; }
    if (peak < 1e-4 || peak > 0.5) return samples;
    const g = Math.min(8, 0.7 / peak);
    const out = new Float32Array(samples.length);
    for (let i = 0; i < samples.length; i++) out[i] = samples[i] * g;
    return out;
  }

  /**
   * Live chunker: feed it 16 kHz samples as they arrive; it calls onChunk(Float32Array)
   * whenever the speaker pauses (after at least minSec of audio) or at maxSec.
   */
  class LiveSegmenter {
    constructor(onChunk, opts = {}) {
      this.onChunk = onChunk;
      this.minSec = opts.minSec ?? 3;
      this.maxSec = opts.maxSec ?? 15;
      this.pauseSec = opts.pauseSec ?? 0.6;
      this.preRollSec = opts.preRollSec ?? 0.4; // silence kept before speech starts
      this.reset();
    }
    reset() {
      this.parts = [];
      this.dbs = [];
      this.loud = [];
      this.len = 0;
      this.pending = new Float32Array(0);
      this.floor = -60;
      this.silentRun = 0;
      this.speechSec = 0;
      this.level = -90;
    }
    push(samples) {
      // join with leftover so we work in whole 30 ms frames
      const all = new Float32Array(this.pending.length + samples.length);
      all.set(this.pending); all.set(samples, this.pending.length);
      let off = 0;
      while (off + FRAME <= all.length) {
        const frame = all.subarray(off, off + FRAME);
        this._frame(frame);
        off += FRAME;
      }
      this.pending = all.slice(off);
    }
    _frame(frame) {
      const db = frameDb(frame, 0, frame.length);
      this.level = db;
      // adaptive noise floor: drops instantly, rises slowly
      if (db < this.floor) this.floor = db; else this.floor += 0.02;
      const speaking = db > Math.max(this.floor + 9, -52);
      this.parts.push(new Float32Array(frame));
      this.dbs.push(db);
      this.loud.push(speaking);
      this.len += frame.length;
      const sec = this.len / SR;
      if (speaking) { this.silentRun = 0; this.speechSec += FRAME / SR; } else this.silentRun += FRAME / SR;
      // Drop long stretches of pure silence instead of sending them (keep a short pre-roll).
      if (this.speechSec === 0 && sec > this.preRollSec) { this.parts.shift(); this.dbs.shift(); this.loud.shift(); this.len -= FRAME; return; }
      if (sec >= this.minSec && this.silentRun >= this.pauseSec) this.flush();
      else if (sec >= this.maxSec) this._forceCut();
    }
    // Nobody paused: cut at the quietest moment of the last few seconds, not mid-word,
    // and carry the rest over into the next chunk.
    _forceCut() {
      const n = this.parts.length;
      const look = Math.min(n - 1, Math.round(3 / (FRAME / SR)));
      let best = n, bestDb = Infinity;
      for (let i = n - look; i < n; i++) {
        const d = (this.dbs[i - 1] + this.dbs[i] + (this.dbs[i + 1] ?? this.dbs[i])) / 3;
        if (d < bestDb) { bestDb = d; best = i; }
      }
      const rest = { parts: this.parts.splice(best), dbs: this.dbs.splice(best), loud: this.loud.splice(best) };
      this.len = this.parts.length * FRAME;
      this.speechSec = this.loud.filter(Boolean).length * (FRAME / SR);
      this.flush();
      this.parts = rest.parts; this.dbs = rest.dbs; this.loud = rest.loud;
      this.len = this.parts.length * FRAME;
      this.speechSec = this.loud.filter(Boolean).length * (FRAME / SR);
    }
    flush() {
      const hadSpeech = this.speechSec >= 0.35;
      const out = new Float32Array(this.len);
      let o = 0;
      for (const p of this.parts) { out.set(p, o); o += p.length; }
      this.parts = []; this.dbs = []; this.loud = []; this.len = 0; this.silentRun = 0; this.speechSec = 0;
      if (hadSpeech && out.length) this.onChunk(out);
    }
  }

  // ---------- browser-only helpers ----------

  /** Decode any audio/video file bytes to 16 kHz mono Float32Array. */
  async function decodeToMono16k(arrayBuffer) {
    const Ctx = root.AudioContext || root.webkitAudioContext;
    const ctx = new Ctx({ sampleRate: SR });
    try {
      const ab = await ctx.decodeAudioData(arrayBuffer);
      const ch = ab.numberOfChannels;
      const out = new Float32Array(ab.length);
      for (let c = 0; c < ch; c++) {
        const d = ab.getChannelData(c);
        for (let i = 0; i < d.length; i++) out[i] += d[i] / ch;
      }
      return out;
    } finally {
      ctx.close();
    }
  }

  /** Concatenate WAV byte arrays (as returned by TTS) into one WAV, via Web Audio. */
  async function concatWavs(wavList, gapSec = 0.35) {
    const Ctx = root.AudioContext || root.webkitAudioContext;
    const ctx = new Ctx({ sampleRate: 24000 });
    try {
      const bufs = [];
      for (const w of wavList) bufs.push(await ctx.decodeAudioData(w.slice ? w.slice(0) : w));
      const gap = Math.round(gapSec * 24000);
      const total = bufs.reduce((n, b) => n + b.length + gap, 0);
      const out = new Float32Array(total);
      let o = 0;
      for (const b of bufs) { out.set(b.getChannelData(0), o); o += b.length + gap; }
      return encodeWav(out, 24000);
    } finally {
      ctx.close();
    }
  }

  const api = { SR, FRAME, segmentBySilence, encodeWav, normalize, LiveSegmenter, frameLevels, decodeToMono16k, concatWavs };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AudioKit = api;
})(typeof window !== 'undefined' ? window : globalThis);
