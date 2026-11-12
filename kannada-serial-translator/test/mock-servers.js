// Fake Sarvam + Anthropic + Kenpath Labs APIs so the whole app can be exercised offline.
const http = require('http');
const A = require('../src/renderer/audio.js');

const TAMIL = ['அம்மா, நான் வந்துட்டேன்.', 'நீ எங்க போயிருந்த?', 'கோவிலுக்கு போனேன் மா.', 'சரி, சாப்பிடு.'];
const KANNADA = {
  'அம்மா, நான் வந்துட்டேன்.': 'ಅಮ್ಮಾ, ನಾನು ಬಂದೆ.',
  'நீ எங்க போயிருந்த?': 'ನೀನು ಎಲ್ಲಿಗೆ ಹೋಗಿದ್ದೆ?',
  'கோவிலுக்கு போனேன் மா.': 'ದೇವಸ್ಥಾನಕ್ಕೆ ಹೋಗಿದ್ದೆ ಅಮ್ಮಾ.',
  'சரி, சாப்பிடு.': 'ಸರಿ, ಊಟ ಮಾಡು.',
};
const calls = { stt: 0, tts: 0, translate: 0, claude: 0, kenpath: 0, claudeBodies: [], ttsBodies: [], kenpathBodies: [] };
// knobs for tests
const opts = { failStt: new Set(), claudeDelay: 0, sarvamKey: 'test-sarvam', claudeKey: 'test-claude', kenpathKey: 'test-kenpath' };

function toneWav() {
  const n = 24000 * 0.4, f = new Float32Array(n);
  for (let k = 0; k < n; k++) f[k] = 0.2 * Math.sin(k / 6);
  return Buffer.from(A.encodeWav(f, 24000));
}

function readBody(req) {
  return new Promise((r) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => r(Buffer.concat(c))); });
}

function start(port) {
  return new Promise((resolve) => {
    const srv = http.createServer(async (req, res) => {
      const body = await readBody(req);
      const json = (o, code = 200) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
      const sarvamOk = req.headers['api-subscription-key'] === opts.sarvamKey;
      if (req.url === '/speech-to-text') {
        if (!sarvamOk) return json({ error: { message: 'Invalid API key' } }, 403);
        const s = body.toString('latin1');
        if (!/name="language_code"\r\n\r\nta-IN/.test(s) || !/filename="chunk.wav"/.test(s)) return json({ error: { message: 'bad form' } }, 400);
        const n = calls.stt++;
        if (opts.failStt.has(n)) return json({ error: { message: 'audio could not be processed' } }, 400);
        const t = TAMIL[n % TAMIL.length];
        const ts = /name="with_timestamps"\r\n\r\ntrue/.test(s);
        return json({ transcript: t, language_code: 'ta-IN', ...(ts ? { timestamps: { words: [t], start_time_seconds: [0.2], end_time_seconds: [2.5] } } : {}) });
      }
      if (req.url === '/translate') {
        if (!sarvamOk) return json({ error: { message: 'Invalid API key' } }, 403);
        calls.translate++;
        return json({ translated_text: 'ಸಾರ್ವಂ ಅನುವಾದ' });
      }
      if (req.url === '/text-to-speech') {
        if (!sarvamOk) return json({ error: { message: 'Invalid API key' } }, 403);
        calls.tts++;
        const p = JSON.parse(body);
        calls.ttsBodies.push(p);
        if (p.language_code !== 'kn-IN' || !p.speaker || !p.text) return json({ error: { message: 'bad tts' } }, 400);
        return json({ audios: [toneWav().toString('base64')] });
      }
      if (req.url === '/v1/audio/speech') {
        if (req.headers.authorization !== 'Bearer ' + opts.kenpathKey) return json({ detail: { status: 'invalid_api_key', message: 'API key invalid or revoked.' } }, 401);
        calls.kenpath++;
        const p = JSON.parse(body);
        calls.kenpathBodies.push(p);
        if (!p.input || !String(p.voice).startsWith('sv_') || p.response_format !== 'wav') return json({ detail: { message: 'bad request' } }, 422);
        res.writeHead(200, { 'content-type': 'audio/wav' });
        return res.end(toneWav());
      }
      if (req.url.startsWith('/v1/messages')) {
        if (req.headers['x-api-key'] !== opts.claudeKey && req.headers.authorization !== 'Bearer ' + opts.claudeKey) return json({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }, 401);
        calls.claude++;
        const p = JSON.parse(body);
        const user = p.messages[0].content;
        const reply = (text) => json({
          id: 'msg_test', type: 'message', role: 'assistant', model: p.model, stop_reason: 'end_turn', stop_sequence: null,
          content: [{ type: 'text', text }], usage: { input_tokens: 10, output_tokens: 10 },
        });
        if (!String(user).includes('translate_these')) return reply('ನಮಸ್ಕಾರ');
        calls.claudeBodies.push(p);
        if (opts.claudeDelay) await new Promise((r) => setTimeout(r, opts.claudeDelay));
        const payload = JSON.parse(user.slice(user.indexOf('{')));
        const lines = payload.translate_these.map((l) => ({
          id: l.id,
          tamil: l.tamil.replace('போயிருந்த?', 'போயிருந்த?!'),
          kannada: KANNADA[l.tamil] || 'ಸರಿ.',
          gender: l.tamil.includes('வந்துட்டேன்') ? 'male' : 'female',
          note: l.tamil.includes('கோவில') ? 'Temple visit kept as is.' : '',
        }));
        return reply(JSON.stringify({ lines }));
      }
      json({ error: 'not found ' + req.url }, 404);
    });
    srv.listen(port, () => resolve(srv));
  });
}
module.exports = { start, calls, opts, TAMIL, KANNADA };
