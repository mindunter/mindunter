'use strict';
// Settings are kept in the app's data folder. API keys are encrypted with the
// operating system's keychain (Windows DPAPI / macOS Keychain) when available.
const fs = require('fs');
const path = require('path');

let safeStorage = null;
try {
  safeStorage = require('electron').safeStorage;
} catch {
  safeStorage = null; // running under plain Node (tests)
}

const DEFAULTS = {
  sarvamKey: '',
  anthropicKey: '',
  kenpathKey: '',
  // Speech-to-text
  sttModel: 'saaras:v3',
  // Translation
  translationEngine: 'auto', // auto = Claude if key present, else Sarvam
  claudeModel: 'claude-haiku-5-5',
  kannadaStyle: 'bengaluru', // bengaluru (everyday spoken) | formal (standard)
  glossary: '', // "Tamil name = Kannada name" one per line
  storyNotes: '',
  // Voice
  ttsModel: 'svara-tts-turbo', // Kenpath Labs Svara; bulbul:* = Sarvam
  voiceFemale: 'sv_eh86y5gc', // Spoorthi
  voiceMale: 'sv_msznkuah', // Girish
  voiceAuto: true, // pick male/female voice by who is speaking
  pace: 1.0,
  // App
  uiLang: 'en', // en | kn
  tutorialDone: false,
  settingsVersion: 4,
};
const CHEAP_MODEL = 'claude-haiku-5-5';

const SECRET_FIELDS = ['sarvamKey', 'anthropicKey', 'kenpathKey'];
let file = null;
let cache = { ...DEFAULTS };

function encrypt(v) {
  if (!v) return '';
  if (safeStorage && safeStorage.isEncryptionAvailable()) {
    return 'enc:' + safeStorage.encryptString(v).toString('base64');
  }
  return 'plain:' + Buffer.from(v, 'utf8').toString('base64');
}

function decrypt(v) {
  if (!v) return '';
  if (v.startsWith('enc:') && safeStorage) {
    try {
      return safeStorage.decryptString(Buffer.from(v.slice(4), 'base64'));
    } catch {
      return '';
    }
  }
  if (v.startsWith('plain:')) return Buffer.from(v.slice(6), 'base64').toString('utf8');
  return v;
}

function init(userDataDir) {
  file = path.join(userDataDir, 'settings.json');
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    cache = { ...DEFAULTS, ...raw };
    for (const k of SECRET_FIELDS) cache[k] = decrypt(raw[k]);
    // v2: Claude Haiku translates and Kenpath Svara speaks by default.
    if ((raw.settingsVersion || 1) < 2) {
      for (const k of ['claudeModel', 'ttsModel', 'voiceFemale', 'voiceMale']) cache[k] = DEFAULTS[k];
    }
    // v3: two Kannada styles only; Haiku by default to keep token use low.
    if ((raw.settingsVersion || 1) < 3) {
      if (cache.kannadaStyle !== 'formal') cache.kannadaStyle = 'bengaluru';
      cache.claudeModel = CHEAP_MODEL;
    }
    // v4: the tutorial became a guided tour of the home screen; show it once more.
    if ((raw.settingsVersion || 1) < 4) cache.tutorialDone = false;
    cache.settingsVersion = DEFAULTS.settingsVersion;
  } catch {
    cache = { ...DEFAULTS };
  }
  // Environment variables work too (handy for testing).
  if (!cache.sarvamKey && process.env.SARVAM_API_KEY) cache.sarvamKey = process.env.SARVAM_API_KEY;
  if (!cache.anthropicKey && process.env.ANTHROPIC_API_KEY) cache.anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!cache.kenpathKey && process.env.KENPATH_API_KEY) cache.kenpathKey = process.env.KENPATH_API_KEY;
}

function persist() {
  if (!file) return;
  const out = { ...cache };
  for (const k of SECRET_FIELDS) out[k] = encrypt(cache[k]);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
}

function get() {
  return { ...cache };
}

// What the window is allowed to see: never the raw keys.
function getPublic() {
  const s = { ...cache };
  for (const k of SECRET_FIELDS) {
    s[k + 'Set'] = !!cache[k];
    s[k] = cache[k] ? '•'.repeat(8) + cache[k].slice(-4) : '';
  }
  return s;
}

function save(patch) {
  let newClaudeKey = false;
  for (const [k, v] of Object.entries(patch || {})) {
    if (!(k in DEFAULTS)) continue;
    if (SECRET_FIELDS.includes(k)) {
      if (typeof v === 'string' && v.startsWith('••••')) continue; // unchanged mask
      const next = String(v || '').trim();
      if (k === 'anthropicKey' && next && next !== cache[k]) newClaudeKey = true;
      cache[k] = next;
    } else {
      cache[k] = v;
    }
  }
  // A new Claude key always starts on Haiku, the cheapest model.
  if (newClaudeKey) cache.claudeModel = CHEAP_MODEL;
  persist();
  return getPublic();
}

module.exports = { init, get, getPublic, save, DEFAULTS };
