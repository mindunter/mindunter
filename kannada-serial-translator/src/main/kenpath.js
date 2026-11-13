'use strict';
// Kenpath Labs (https://kenpathlabs.com) — Svara text-to-speech.
//   Text-to-speech  : Kannada text -> Kannada voice  (POST /v1/audio/speech, raw audio back)
const { splitText } = require('./sarvam');

const BASE = process.env.KENPATH_BASE_URL || 'https://api.kenpathlabs.com';
const MODEL = 'svara-tts-turbo';
// Kannada-accent voices (GET /v1/voices, accent_family "kannada").
const DEFAULT_FEMALE = 'sv_eh86y5gc'; // Spoorthi
const DEFAULT_MALE = 'sv_msznkuah'; // Girish

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastRemaining = NaN; // characters left on the plan, from the last response header

async function request(key, pathname, body, attempt = 0) {
  if (!key) throw new ApiError('Kenpath Labs API key is missing. Add it in Settings, or pick a Sarvam voice model.', 401);
  let res;
  try {
    res = await fetch(BASE + pathname, {
      method: 'POST',
      headers: { authorization: 'Bearer ' + key, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90_000),
    });
  } catch (err) {
    if (attempt < 3) {
      await sleep(1000 * 2 ** attempt);
      return request(key, pathname, body, attempt + 1);
    }
    throw new ApiError('Could not reach Kenpath Labs. Check the internet connection. (' + err.message + ')', 0);
  }
  if (res.ok) {
    const left = Number(res.headers.get('x-ratelimit-remaining-characters'));
    if (res.headers.has('x-ratelimit-remaining-characters') && Number.isFinite(left)) lastRemaining = left;
    return Buffer.from(await res.arrayBuffer());
  }
  const text = await res.text().catch(() => '');
  if ((res.status === 429 || res.status >= 500) && attempt < 4) {
    const retryAfter = Number(res.headers.get('retry-after')) || 0;
    await sleep(Math.max(retryAfter * 1000, 1500 * 2 ** attempt));
    return request(key, pathname, body, attempt + 1);
  }
  let msg = text;
  try {
    const j = JSON.parse(text);
    const d = j.detail || j.error || j;
    msg = (d && (d.message || d.status)) || text;
    if (typeof msg !== 'string') msg = JSON.stringify(msg);
  } catch {}
  if (res.status === 401 || res.status === 403) msg = 'Kenpath Labs key was rejected. Check it in Settings. ' + msg;
  throw new ApiError(`Kenpath ${pathname} failed (${res.status}): ${msg}`.slice(0, 500), res.status);
}

/** Kannada text -> list of WAV buffers (one per ≤2000-char piece), same shape as sarvam.speak. */
async function speak(settings, text, gender) {
  const female = String(settings.voiceFemale || '').startsWith('sv_') ? settings.voiceFemale : DEFAULT_FEMALE;
  const male = String(settings.voiceMale || '').startsWith('sv_') ? settings.voiceMale : DEFAULT_MALE;
  const voice = settings.voiceAuto && gender === 'male' ? male : female;
  const speed = Math.min(1.5, Math.max(0.7, Number(settings.pace) || 1));
  const audios = [];
  for (const piece of splitText(text, 2000)) {
    audios.push(
      await request(settings.kenpathKey, '/v1/audio/speech', {
        model: MODEL,
        input: piece,
        voice,
        lang: 'kn',
        response_format: 'wav',
        sample_rate: 24000,
        speed,
      })
    );
  }
  return audios;
}

async function testKey(key) {
  try {
    const wav = await request(key, '/v1/audio/speech', { model: MODEL, input: 'ನಮಸ್ಕಾರ', voice: DEFAULT_FEMALE, lang: 'kn', response_format: 'wav' });
    return { ok: wav.length > 0 };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

const isKenpathModel = (model) => String(model || '').startsWith('svara');

const lastRemainingChars = () => lastRemaining;

module.exports = { speak, testKey, isKenpathModel, lastRemainingChars, MODEL, DEFAULT_FEMALE, DEFAULT_MALE, ApiError };
