'use strict';
// Sarvam AI (https://sarvam.ai) — Indian-language speech models.
//   Speech-to-text  : Tamil audio -> Tamil text      (POST /speech-to-text, <30 s per request)
//   Translate       : Tamil text  -> Kannada text    (POST /translate, fallback engine)
//   Text-to-speech  : Kannada text -> Kannada voice  (POST /text-to-speech)
const BASE = process.env.SARVAM_BASE_URL || 'https://api.sarvam.ai';

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function request(key, pathname, init, attempt = 0) {
  if (!key) throw new ApiError('Sarvam API key is missing. Add it in Settings.', 401);
  let res;
  try {
    res = await fetch(BASE + pathname, {
      ...init,
      headers: { 'api-subscription-key': key, ...(init.headers || {}) },
      signal: AbortSignal.timeout(90_000),
    });
  } catch (err) {
    if (attempt < 3) {
      await sleep(1000 * 2 ** attempt);
      return request(key, pathname, init, attempt + 1);
    }
    throw new ApiError('Could not reach Sarvam AI. Check the internet connection. (' + err.message + ')', 0);
  }
  if (res.ok) return res.json();
  const body = await res.text().catch(() => '');
  if ((res.status === 429 || res.status >= 500) && attempt < 4) {
    const retryAfter = Number(res.headers.get('retry-after')) || 0;
    await sleep(Math.max(retryAfter * 1000, 1500 * 2 ** attempt));
    return request(key, pathname, init, attempt + 1);
  }
  let msg = body;
  try {
    const j = JSON.parse(body);
    msg = (j.error && (j.error.message || j.error.code)) || j.message || j.detail || body;
    if (typeof msg !== 'string') msg = JSON.stringify(msg);
  } catch {}
  if (res.status === 401 || res.status === 403) msg = 'Sarvam API key was rejected. Check it in Settings. ' + msg;
  throw new ApiError(`Sarvam ${pathname} failed (${res.status}): ${msg}`.slice(0, 500), res.status);
}

/** Transcribe one ≤30 s WAV chunk of Tamil speech. */
async function transcribe(settings, wavBuffer, { withTimestamps = false } = {}) {
  const form = new FormData();
  form.append('file', new Blob([wavBuffer], { type: 'audio/wav' }), 'chunk.wav');
  const model = settings.sttModel || 'saaras:v3';
  form.append('model', model);
  if (model === 'saaras:v3') form.append('mode', 'transcribe');
  form.append('language_code', 'ta-IN');
  if (withTimestamps) form.append('with_timestamps', 'true');
  const j = await request(settings.sarvamKey, '/speech-to-text', { method: 'POST', body: form });
  const out = { transcript: (j.transcript || '').trim(), segments: [] };
  const ts = j.timestamps;
  if (ts && Array.isArray(ts.words)) {
    out.segments = ts.words.map((w, i) => ({
      text: String(w).trim(),
      start: Number(ts.start_time_seconds?.[i]) || 0,
      end: Number(ts.end_time_seconds?.[i]) || 0,
    })).filter((s) => s.text);
  }
  return out;
}

/** Fallback translator (no Claude key): Sarvam Mayura, spoken-style Kannada. */
async function translate(settings, text, gender) {
  const chunks = splitText(text, 900);
  const out = [];
  for (const c of chunks) {
    const body = {
      input: c,
      source_language_code: 'ta-IN',
      target_language_code: 'kn-IN',
      model: 'mayura:v1',
      mode: settings.kannadaStyle === 'formal' ? 'formal' : 'modern-colloquial',
    };
    if (gender === 'male') body.speaker_gender = 'Male';
    if (gender === 'female') body.speaker_gender = 'Female';
    const j = await request(settings.sarvamKey, '/translate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    out.push(j.translated_text || '');
  }
  return out.join(' ').trim();
}

/** Kannada text -> list of WAV buffers (one per ≤2000-char piece). */
async function speak(settings, text, gender) {
  const model = settings.ttsModel || 'bulbul:v3';
  const limit = model === 'bulbul:v2' ? 1400 : 2000;
  // With "auto voice" on, men's lines use the male voice; otherwise the main (female) voice.
  const speaker = settings.voiceAuto && gender === 'male' ? settings.voiceMale || 'rahul' : settings.voiceFemale || 'kavya';
  const pace = Math.min(2, Math.max(0.5, Number(settings.pace) || 1));
  const audios = [];
  for (const piece of splitText(text, limit)) {
    const body = { text: piece, language_code: 'kn-IN', speaker, model, pace, speech_sample_rate: 24000 };
    if (model === 'bulbul:v2') body.enable_preprocessing = true;
    const j = await request(settings.sarvamKey, '/text-to-speech', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    for (const a of j.audios || []) audios.push(Buffer.from(a, 'base64'));
  }
  return audios;
}

async function testKey(key) {
  try {
    const j = await request(key, '/translate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: 'வணக்கம்', source_language_code: 'ta-IN', target_language_code: 'kn-IN', model: 'mayura:v1' }),
    });
    return { ok: true, sample: j.translated_text };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/** Split on sentence ends so no piece exceeds `max` characters. */
function splitText(text, max) {
  const t = String(text || '').trim();
  if (t.length <= max) return t ? [t] : [];
  const parts = t.split(/(?<=[.!?।…])\s+/);
  const out = [];
  let cur = '';
  for (const p of parts) {
    if ((cur + ' ' + p).trim().length > max && cur) {
      out.push(cur.trim());
      cur = '';
    }
    if (p.length > max) {
      for (let i = 0; i < p.length; i += max) out.push(p.slice(i, i + max));
    } else cur += ' ' + p;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

module.exports = { transcribe, translate, speak, testKey, splitText, ApiError };
