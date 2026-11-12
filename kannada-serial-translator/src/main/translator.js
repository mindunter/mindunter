'use strict';
// Tamil -> spoken Kannada dialogue translation.
// Primary engine: Claude (reads the whole scene, keeps tone, slang, honorifics and
// character names consistent, fixes obvious speech-recognition slips).
// Fallback engine: Sarvam Mayura (used when no Claude key is set, or if Claude declines).
const Anthropic = require('@anthropic-ai/sdk');
const { zodOutputFormat } = require('@anthropic-ai/sdk/helpers/zod');
const { z } = require('zod/v4');
const sarvam = require('./sarvam');

const STYLES = {
  bengaluru:
    'Everyday spoken Bengaluru / Old-Mysuru Kannada exactly as heard in popular Kannada TV serials (Zee Kannada, Colors Kannada, Star Suvarna). Contracted spoken verb forms ("ಏನ್ ಮಾಡ್ತಿದ್ದೀಯಾ?", "ಬರ್ತೀನಿ", "ಹೋಗ್ಲಿ ಬಿಡು", "ಗೊತ್ತಿಲ್ವಾ?"), natural English words where Kannada speakers really use them (phone, office, sorry), written in Kannada script.',
  mysuru:
    'Spoken Mysuru–Mandya family Kannada with its warm rural-town flavour ("ಏನ್ಲಾ", "ಬಾರಮ್ಮ", "ಹೇಳ್ರಿ"), as used in village/joint-family Kannada serials, written in Kannada script.',
  north:
    'Spoken North-Karnataka (Hubballi–Dharwad) Kannada ("ಏನ್ರೀ", "ಬರ್ರಿ", "ಹೌದಲ್ಲ", "ಏನಾತು?"), as used in North-Karnataka-set serials, written in Kannada script.',
  formal:
    'Clean standard (ಗ್ರಾಂಥಿಕ-leaning but natural) Kannada suitable for narration or formal characters, written in Kannada script.',
};

function systemPrompt(settings) {
  const style = STYLES[settings.kannadaStyle] || STYLES.bengaluru;
  const glossary = String(settings.glossary || '').trim();
  const notes = String(settings.storyNotes || '').trim();
  return [
    'You are a senior Kannada television dialogue writer adapting a Tamil daily serial into a Kannada remake. ',
    'You receive lines that a speech-recognition system transcribed from the Tamil episode audio. ',
    'For each line, write how a Kannada character would actually say it on screen.\n\n',
    'Target register: ', style, '\n\n',
    'Rules:\n',
    '- Translate meaning, emotion and intent, not word-by-word. Replace Tamil idioms, proverbs and jokes with natural Kannada equivalents that land the same way.\n',
    '- Keep the same respect level: நீங்க/நீங்கள் → ನೀವು, நீ → ನೀನು; keep "-ங்க" politeness as "-ರಿ/-ಇ" endings. Map kinship terms the way Kannada families say them (அம்மா→ಅಮ್ಮ, அப்பா→ಅಪ್ಪ, அண்ணா→ಅಣ್ಣ, அக்கா→ಅಕ್ಕ, அண்ணி→ಅತ್ತಿಗೆ, மாமா→ಮಾವ, அத்தை→ಅತ್ತೆ, மாமியார்→ಅತ್ತೆ, தம்பி→ತಮ್ಮ, தங்கச்சி→ತಂಗಿ).\n',
    '- Use correct Kannada punctuation: full stop, comma, question mark, exclamation mark and "..." for trailing or hesitant speech, so a voice actor can read it with the right pauses and intonation.\n',
    '- Speech recognition sometimes mishears words. Use the surrounding lines to infer what was really said; never translate obvious recognition garbage literally. If a line is pure noise, music or unintelligible, return an empty "kannada" string.\n',
    '- Keep character names consistent across the episode. Use the glossary below for names and places when given.\n',
    '- Output only Kannada script in "kannada" (no Tamil, no transliteration, no explanations).\n',
    '- In "gender", say whether the speaker of that line is male or female, judged from Tamil verb endings (-ன்/-ான் male, -ள்/-ாள் female), forms of address and context; use "unknown" when you cannot tell.\n',
    '- In "note", optionally add a very short English note for the writer only when something cultural needed adapting (otherwise empty string).\n',
    glossary ? '\nName / place glossary (Tamil = Kannada):\n' + glossary + '\n' : '',
    notes ? '\nStory notes from the writer:\n' + notes + '\n' : '',
  ].join('');
}

const OutputSchema = z.object({
  lines: z.array(
    z.object({
      id: z.string(),
      kannada: z.string(),
      gender: z.enum(['male', 'female', 'unknown']),
      note: z.string(),
    })
  ),
});

let client = null;
let clientKey = null;
function getClient(key) {
  if (!client || clientKey !== key) {
    client = new Anthropic({ apiKey: key, maxRetries: 4, timeout: 10 * 60 * 1000 });
    clientKey = key;
  }
  return client;
}

function useClaude(settings) {
  if (settings.translationEngine === 'sarvam') return false;
  return !!settings.anthropicKey;
}

/**
 * lines:   [{ id, ta }]
 * context: [{ ta, kn }]  — the previous few lines, so the scene flows.
 * returns: { engine, lines: [{ id, kn, gender, note }], warning? }
 */
async function translateLines(settings, lines, context, { live = false } = {}) {
  const todo = lines.filter((l) => String(l.ta || '').trim());
  if (!todo.length) return { engine: 'none', lines: lines.map((l) => ({ id: l.id, kn: '', gender: 'unknown', note: '' })) };

  if (useClaude(settings)) {
    try {
      return { engine: 'claude', lines: await viaClaude(settings, lines, context, live) };
    } catch (err) {
      if (!settings.sarvamKey || err.fatal) throw err;
      const res = await viaSarvam(settings, lines);
      res.warning = 'Claude translation failed, used Sarvam instead: ' + err.message;
      return res;
    }
  }
  return viaSarvam(settings, lines);
}

async function viaClaude(settings, lines, context, live) {
  const c = getClient(settings.anthropicKey);
  const ctx = (context || []).slice(-20);
  const payload = {
    previous_lines_for_context_only: ctx.map((l) => ({ tamil: l.ta, kannada: l.kn })),
    translate_these: lines.map((l) => ({ id: String(l.id), tamil: l.ta })),
  };
  let response;
  try {
    response = await c.messages.parse({
      model: settings.claudeModel || 'claude-haiku-5-5',
      max_tokens: 32000,
      system: [{ type: 'text', text: systemPrompt(settings), cache_control: { type: 'ephemeral' } }],
      output_config: { effort: live ? 'low' : 'medium', format: zodOutputFormat(OutputSchema) },
      messages: [
        {
          role: 'user',
          content:
            'Translate every line in "translate_these" (return one entry per id, same ids, same order).\n\n' +
            JSON.stringify(payload, null, 1),
        },
      ],
    });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      const e = new Error('Claude API key was rejected. Check it in Settings.');
      e.fatal = true;
      throw e;
    }
    if (err instanceof Anthropic.RateLimitError) throw new Error('Claude rate limit reached — try again in a minute.');
    if (err instanceof Anthropic.APIConnectionError) throw new Error('Could not reach Claude. Check the internet connection.');
    throw err;
  }
  if (response.stop_reason === 'refusal') throw new Error('Claude declined this passage');
  if (response.stop_reason === 'max_tokens') throw new Error('Claude response was cut off');
  const parsed = response.parsed_output;
  if (!parsed) throw new Error('Claude returned an unreadable answer');
  const byId = new Map(parsed.lines.map((l) => [String(l.id), l]));
  return lines.map((l) => {
    const r = byId.get(String(l.id));
    return { id: l.id, kn: r ? r.kannada.trim() : '', gender: r ? r.gender : 'unknown', note: r ? r.note.trim() : '' };
  });
}

async function viaSarvam(settings, lines) {
  if (!settings.sarvamKey) throw new Error('No translation key set. Add a Sarvam (or Claude) key in Settings.');
  const out = [];
  for (const l of lines) {
    const kn = String(l.ta || '').trim() ? await sarvam.translate(settings, l.ta) : '';
    out.push({ id: l.id, kn, gender: 'unknown', note: '' });
  }
  return { engine: 'sarvam', lines: out };
}

async function testKey(key, model) {
  try {
    const c = getClient(key);
    const r = await c.messages.create({
      model: model || 'claude-haiku-5-5',
      max_tokens: 2000,
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: 'Reply with the single Kannada word for "hello".' }],
    });
    const text = r.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
    return { ok: true, sample: text };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = { translateLines, testKey, systemPrompt, OutputSchema };
