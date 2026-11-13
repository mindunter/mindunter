'use strict';
// Local usage meter for the API dashboard in Settings. Counts what this app sent,
// per calendar month, and estimates the cost from the providers' published prices.
// (Claude and Sarvam do not expose an account balance to API keys; Kenpath reports
// remaining characters in a response header, which is kept here too.)
const fs = require('fs');
const path = require('path');

// USD per million tokens: [input, output]; cache reads cost 0.1x input.
const CLAUDE_PRICES = {
  'claude-haiku-5-5': [0.1, 0.5],
  'claude-sonnet-5-5': [2, 10],
  'claude-opus-5-5': [4, 20],
};
// INR
const SARVAM = { sttPerMin: 0.49, ttsPer1k: { 'bulbul:v3': 3, 'bulbul:v4-flash': 2, 'bulbul:v2': 3 }, translatePer1k: 2 };
const KENPATH = { freeChars: 100000, per1kAfterFree: 1 };

let file = null;
let data = { months: {}, kenpathQuota: null };

const month = () => new Date().toISOString().slice(0, 7);
function cur() {
  const m = month();
  if (!data.months[m]) {
    data.months[m] = {
      claude: { requests: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, costUsd: 0, byModel: {} },
      sarvam: { sttRequests: 0, sttSeconds: 0, ttsRequests: 0, ttsChars: 0, translateChars: 0, costInr: 0 },
      kenpath: { requests: 0, chars: 0 },
    };
  }
  return data.months[m];
}

function init(dir) {
  file = path.join(dir, 'usage.json');
  try { data = { months: {}, kenpathQuota: null, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { /* first run */ }
}
let timer = null;
function persist() {
  if (!file || timer) return;
  timer = setTimeout(() => {
    timer = null;
    try { fs.writeFileSync(file, JSON.stringify(data)); } catch { /* best effort */ }
  }, 500);
}

function addClaude(model, u) {
  if (!u) return;
  const c = cur().claude;
  const [pin, pout] = CLAUDE_PRICES[model] || CLAUDE_PRICES['claude-haiku-5-5'];
  const input = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0);
  const cached = u.cache_read_input_tokens || 0;
  const out = u.output_tokens || 0;
  c.requests++;
  c.inputTokens += input;
  c.cacheReadTokens += cached;
  c.outputTokens += out;
  c.costUsd += (input * pin + cached * pin * 0.1 + out * pout) / 1e6;
  c.byModel[model] = (c.byModel[model] || 0) + 1;
  persist();
}

function addSarvamStt(seconds) {
  const s = cur().sarvam;
  s.sttRequests++;
  s.sttSeconds += seconds;
  s.costInr += (seconds / 60) * SARVAM.sttPerMin;
  persist();
}
function addSarvamTts(model, chars) {
  const s = cur().sarvam;
  s.ttsRequests++;
  s.ttsChars += chars;
  s.costInr += (chars / 1000) * (SARVAM.ttsPer1k[model] || 3);
  persist();
}
function addSarvamTranslate(chars) {
  const s = cur().sarvam;
  s.translateChars += chars;
  s.costInr += (chars / 1000) * SARVAM.translatePer1k;
  persist();
}
function addKenpath(chars, remaining) {
  const k = cur().kenpath;
  k.requests++;
  k.chars += chars;
  if (Number.isFinite(remaining)) data.kenpathQuota = { remaining, at: Date.now() };
  persist();
}

function summary() {
  const m = cur();
  const kp = m.kenpath;
  const kenpathCostInr = Math.max(0, kp.chars - KENPATH.freeChars) / 1000 * KENPATH.per1kAfterFree;
  return {
    month: month(),
    claude: m.claude,
    sarvam: m.sarvam,
    kenpath: { ...kp, freeChars: KENPATH.freeChars, costInr: kenpathCostInr, quota: data.kenpathQuota },
    prices: { claude: CLAUDE_PRICES, sarvam: SARVAM, kenpath: KENPATH },
  };
}

function reset() {
  delete data.months[month()];
  persist();
  return summary();
}

module.exports = { init, addClaude, addSarvamStt, addSarvamTts, addSarvamTranslate, addKenpath, summary, reset, CLAUDE_PRICES };
