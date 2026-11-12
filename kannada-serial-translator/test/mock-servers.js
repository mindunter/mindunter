// Fake Sarvam + Anthropic APIs so the whole app can be exercised offline.
const http = require('http');
const A = require('../src/renderer/audio.js');

const TAMIL = ['அம்மா, நான் வந்துட்டேன்.', 'நீ எங்க போயிருந்த?', 'கோவிலுக்கு போனேன் மா.', 'சரி, சாப்பிடு.'];
const calls = { stt: 0, tts: 0, translate: 0, claude: 0, claudeBodies: [] };

function readBody(req) {
  return new Promise((r) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => r(Buffer.concat(c))); });
}

function start(port) {
  return new Promise((resolve) => {
    const srv = http.createServer(async (req, res) => {
      const body = await readBody(req);
      const json = (o, code = 200) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (req.url === '/speech-to-text') {
        if (req.headers['api-subscription-key'] !== 'test-sarvam') return json({ error: { message: 'Invalid API key' } }, 403);
        const s = body.toString('latin1');
        if (!/name="language_code"\r\n\r\nta-IN/.test(s) || !/filename="chunk.wav"/.test(s)) return json({ error: { message: 'bad form' } }, 400);
        const i = calls.stt++ % TAMIL.length;
        const ts = /name="with_timestamps"\r\n\r\ntrue/.test(s);
        return json({ transcript: TAMIL[i], language_code: 'ta-IN', ...(ts ? { timestamps: { words: [TAMIL[i]], start_time_seconds: [0.2], end_time_seconds: [2.5] } } : {}) });
      }
      if (req.url === '/translate') { calls.translate++; return json({ translated_text: 'ಸಾರ್ವಂ ಅನುವಾದ' }); }
      if (req.url === '/text-to-speech') {
        calls.tts++;
        const p = JSON.parse(body);
        if (p.language_code !== 'kn-IN' || !p.speaker || !p.text) return json({ error: { message: 'bad tts' } }, 400);
        const n = 24000 * 0.4, f = new Float32Array(n);
        for (let k = 0; k < n; k++) f[k] = 0.2 * Math.sin(k / 6);
        return json({ audios: [Buffer.from(A.encodeWav(f, 24000)).toString('base64')] });
      }
      if (req.url.startsWith('/v1/messages')) {
        calls.claude++;
        const p = JSON.parse(body);
        calls.claudeBodies.push(p);
        const user = p.messages[0].content;
        const payload = JSON.parse(user.slice(user.indexOf('{')));
        const lines = payload.translate_these.map((l) => ({
          id: l.id,
          kannada: { 'அம்மா, நான் வந்துட்டேன்.': 'ಅಮ್ಮಾ, ನಾನು ಬಂದೆ.', 'நீ எங்க போயிருந்த?': 'ನೀನು ಎಲ್ಲಿಗೆ ಹೋಗಿದ್ದೆ?', 'கோவிலுக்கு போனேன் மா.': 'ದೇವಸ್ಥಾನಕ್ಕೆ ಹೋಗಿದ್ದೆ ಅಮ್ಮಾ.', 'சரி, சாப்பிடு.': 'ಸರಿ, ಊಟ ಮಾಡು.' }[l.tamil] || 'ಸರಿ.',
          gender: l.tamil.includes('வந்துட்டேன்') ? 'male' : 'female',
          note: '',
        }));
        return json({
          id: 'msg_test', type: 'message', role: 'assistant', model: p.model, stop_reason: 'end_turn', stop_sequence: null,
          content: [{ type: 'text', text: JSON.stringify({ lines }) }],
          usage: { input_tokens: 10, output_tokens: 10 },
        });
      }
      json({ error: 'not found ' + req.url }, 404);
    });
    srv.listen(port, () => resolve(srv));
  });
}
module.exports = { start, calls, TAMIL };
