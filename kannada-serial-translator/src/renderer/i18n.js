/* English / Kannada interface text.
 * Static text in index.html carries data-i18n / data-i18n-ph / data-i18n-title keys; its
 * English stays in the HTML. Text built in app.js goes through t('English text', vars),
 * keyed by the English itself, so English needs no table. */
(function (root) {
  'use strict';

  const KN = {
    // ---- index.html keys
    'tab.episodes': 'ಸಂಚಿಕೆಗಳು',
    'tab.live': 'ಲೈವ್',
    'tab.settings': 'ಸೆಟ್ಟಿಂಗ್ಸ್',
    'top.keys': 'API ಕೀಗಳು',
    'ep.new': 'ಹೊಸ ಸಂಚಿಕೆ',
    'ep.saved': 'ಉಳಿಸಿದ ಕೆಲಸ',
    'ep.dropTitle': 'ತಮಿಳು ಸಂಚಿಕೆಯನ್ನು ಇಲ್ಲಿ ಬಿಡಿ',
    'ep.or': 'ಅಥವಾ',
    'ep.choose': 'ಫೈಲ್ ಆಯ್ಕೆಮಾಡಿ',
    'ep.formats': 'ವಿಡಿಯೋ ಅಥವಾ ಆಡಿಯೋ — mp4, mkv, mp3, wav, m4a…',
    'how.1': 'ಕೇಳುವುದು',
    'how.1d': 'ತಮಿಳು ಸಂಭಾಷಣೆಯನ್ನು ಕೇಳಿ ಬರೆದುಕೊಳ್ಳಲಾಗುತ್ತದೆ.',
    'how.2': 'ಬರೆಯುವುದು',
    'how.2d': 'ಪ್ರತಿ ಸಾಲೂ ಸಹಜವಾಗಿ ಮಾತನಾಡುವ ಕನ್ನಡವಾಗುತ್ತದೆ.',
    'how.3': 'ಪರಿಶೀಲನೆ',
    'how.3d': 'ಕೇಳಿ, ತಿದ್ದಿ, ಸ್ಕ್ರಿಪ್ಟ್ ಎಕ್ಸ್‌ಪೋರ್ಟ್ ಮಾಡಿ.',
    'ep.listen': 'ಕನ್ನಡದಲ್ಲಿ ಕೇಳಿ',
    'ep.listenTip': 'ಆಯ್ಕೆ ಮಾಡಿದ ಸಾಲಿನಿಂದ ಕನ್ನಡವನ್ನು ಓದಿ ಹೇಳುತ್ತದೆ (K)',
    'ep.stop': 'ನಿಲ್ಲಿಸಿ',
    'ep.export': 'ಎಕ್ಸ್‌ಪೋರ್ಟ್',
    'exp.script': 'ಸ್ಕ್ರಿಪ್ಟ್',
    'exp.doc': 'Word ಡಾಕ್ಯುಮೆಂಟ್ — ತಮಿಳು + ಕನ್ನಡ (.doc)',
    'exp.txt': 'ಕನ್ನಡ ಮಾತ್ರ (.txt)',
    'exp.csv': 'Excel ಟೇಬಲ್ (.csv)',
    'exp.srt': 'ಸಬ್‌ಟೈಟಲ್ಸ್ (.srt)',
    'exp.audio': 'ಆಡಿಯೋ',
    'exp.wav': 'ಎಲ್ಲಾ ಸಾಲುಗಳ ಕನ್ನಡ ಧ್ವನಿ (.wav)',
    'exp.dub': 'ಸಂಚಿಕೆಯ ಸಮಯಕ್ಕೆ ಹೊಂದಿಸಿದ ಕನ್ನಡ ಡಬ್ ಟ್ರ್ಯಾಕ್ (.wav)',
    'more.redo': 'ಈಗಿನ ಸೆಟ್ಟಿಂಗ್ಸ್‌ನಲ್ಲಿ ಮತ್ತೆ ಅನುವಾದಿಸಿ',
    'more.locate': 'ಸಂಚಿಕೆಯ ಫೈಲ್ ಹುಡುಕಿ…',
    'more.delete': 'ಈ ಸಂಚಿಕೆಯನ್ನು ಅಳಿಸಿ',
    'step.listen': 'ಕೇಳುತ್ತಿದೆ',
    'step.write': 'ಕನ್ನಡ ಬರೆಯುತ್ತಿದೆ',
    'step.ready': 'ಸಿದ್ಧ',
    'step.pause': 'ವಿರಾಮ',
    'ep.missing': 'ಮೂಲ ಸಂಚಿಕೆಯ ಫೈಲ್ ಜೋಡಣೆಯಾಗಿಲ್ಲ, ಹಾಗಾಗಿ ತಮಿಳು ಆಡಿಯೋ ಪ್ಲೇ ಆಗದು.',
    'ep.locate': 'ಫೈಲ್ ಹುಡುಕಿ…',
    'ep.search': 'ತಮಿಳು ಅಥವಾ ಕನ್ನಡದಲ್ಲಿ ಹುಡುಕಿ',
    'ep.follow': 'ವಿಡಿಯೋ ಜೊತೆ ಸಾಗು',
    'ep.followTip': 'ವಿಡಿಯೋ ಜೊತೆಗೆ ಪಟ್ಟಿಯೂ ಸರಿಯುತ್ತದೆ',
    'ep.keys': 'Space ಪ್ಲೇ · ↑↓ ಸರಿಸಿ · K ಕೇಳಿ · E ತಿದ್ದಿ',
    'live.system': 'ಈ ಲ್ಯಾಪ್‌ಟಾಪ್‌ನ ಧ್ವನಿ',
    'live.mic': 'ಮೈಕ್ರೊಫೋನ್',
    'live.speak': 'ಕನ್ನಡವನ್ನು ಜೋರಾಗಿ ಹೇಳು',
    'live.clear': 'ಅಳಿಸಿ',
    'live.save': 'ಸಂಚಿಕೆಯಾಗಿ ಉಳಿಸಿ',
    'dash.title': 'ಬಳಕೆ ಮತ್ತು ಕೀಗಳು',
    'dash.sub': 'ಈ ತಿಂಗಳು ಆ್ಯಪ್ ಎಷ್ಟು ಬಳಸಿದೆ, ಮತ್ತು ಅದರ ಅಂದಾಜು ಖರ್ಚು.',
    'dash.refresh': 'ರಿಫ್ರೆಶ್',
    'dash.reset': 'ಎಣಿಕೆ ಮರುಹೊಂದಿಸಿ',
    'dash.note': 'ಆ್ಯಪ್ ಕಳುಹಿಸಿದ್ದನ್ನು ಈ ಕಂಪ್ಯೂಟರ್‌ನಲ್ಲೇ ಎಣಿಸಲಾಗಿದೆ. Claude ಮತ್ತು Sarvam ನಿಮ್ಮ ಖಾತೆಯ ಬ್ಯಾಲೆನ್ಸ್ ಅನ್ನು ಆ್ಯಪ್‌ಗಳಿಗೆ ತೋರಿಸುವುದಿಲ್ಲ, ನಿಖರ ಬ್ಯಾಲೆನ್ಸ್‌ಗೆ ಅವರ ಕನ್ಸೋಲ್ ತೆರೆಯಿರಿ. Kenpath ಉಳಿದ ಅಕ್ಷರಗಳನ್ನು Kenpath ನೇರವಾಗಿ ತಿಳಿಸುತ್ತದೆ.',
    'keys.title': 'API ಕೀಗಳು',
    'keys.sub': 'ಈ ಕಂಪ್ಯೂಟರ್‌ನಲ್ಲಿ ಮಾತ್ರ, ಆಪರೇಟಿಂಗ್ ಸಿಸ್ಟಂ ಎನ್‌ಕ್ರಿಪ್ಟ್ ಮಾಡಿ ಇಡುತ್ತದೆ.',
    'keys.sarvam': 'Sarvam AI ಕೀ',
    'keys.claude': 'Claude ಕೀ',
    'keys.kenpath': 'Kenpath Labs ಕೀ',
    'keys.paste': 'ಕೀ ಅಂಟಿಸಿ',
    'keys.sarvamHelp': 'ತಮಿಳು ಆಡಿಯೋವನ್ನು ಕೇಳುತ್ತದೆ. <a href="https://dashboard.sarvam.ai" target="_blank">dashboard.sarvam.ai</a> ನಲ್ಲಿ ಪಡೆಯಿರಿ.',
    'keys.claudeHelp': 'ಕೇಳಿದ ತಮಿಳನ್ನು ಸರಿಪಡಿಸಿ ಕನ್ನಡ ಬರೆಯುತ್ತದೆ; ಖರ್ಚು ಕಡಿಮೆ ಇರಲು Claude Haiku 5.5 ಬಳಸುತ್ತದೆ. <a href="https://console.anthropic.com" target="_blank">console.anthropic.com</a> ನಲ್ಲಿ ಪಡೆಯಿರಿ. ಇಲ್ಲದಿದ್ದರೆ Sarvam ಅನುವಾದಿಸುತ್ತದೆ.',
    'keys.kenpathHelp': 'Svara ಧ್ವನಿಗಳಲ್ಲಿ ಕನ್ನಡ ಹೇಳುತ್ತದೆ (ತಿಂಗಳಿಗೆ 1,00,000 ಅಕ್ಷರ ಉಚಿತ). <a href="https://platform.kenpathlabs.com/dashboard/keys" target="_blank">platform.kenpathlabs.com</a> ನಲ್ಲಿ ಪಡೆಯಿರಿ. ಇಲ್ಲದಿದ್ದರೆ Sarvam ಹೇಳುತ್ತದೆ.',
    'keys.check': 'ಕೀಗಳನ್ನು ಪರಿಶೀಲಿಸಿ',
    'tag.req': 'ಅಗತ್ಯ',
    'tag.rec': 'ಶಿಫಾರಸು',
    'optional': '(ಐಚ್ಛಿಕ)',
    'write.title': 'ಕನ್ನಡ ಬರವಣಿಗೆ',
    'write.sub': 'ಪಾತ್ರಗಳು ಹೇಗೆ ಮಾತನಾಡಬೇಕು. ಇದು ಪದಗಳನ್ನು ಮಾತ್ರ ಬದಲಿಸುತ್ತದೆ, ಅರ್ಥವನ್ನಲ್ಲ.',
    'write.style': 'ಮಾತಿನ ಶೈಲಿ',
    'write.casual': 'ದಿನನಿತ್ಯದ ಮಾತು',
    'write.casualD': '“ಏನ್ ಮಾಡ್ತಿದ್ದೀಯಾ?” — ಹೆಚ್ಚಿನವರು ಮಾತನಾಡುವಂತೆ, ಬಹುತೇಕ ಧಾರಾವಾಹಿಗಳಲ್ಲಿ ಇರುವಂತೆ',
    'write.formal': 'ಶಿಷ್ಟ',
    'write.formalD': '“ನೀವು ಏನು ಮಾಡುತ್ತಿದ್ದೀರಿ?” — ಸ್ಪಷ್ಟ ಮತ್ತು ಔಪಚಾರಿಕ',
    'write.names': 'ಪಾತ್ರ ಮತ್ತು ಸ್ಥಳಗಳ ಹೆಸರುಗಳು',
    'write.namesHelp': 'ಎಲ್ಲಾ ಸಾಲುಗಳಲ್ಲೂ ಹೆಸರುಗಳು ಒಂದೇ ಇರುತ್ತವೆ, ರಿಮೇಕ್‌ಗಾಗಿ ಹೆಸರು ಬದಲಿಸಲೂ ಬಹುದು.',
    'write.notes': 'ಕಥೆಯ ಟಿಪ್ಪಣಿಗಳು',
    'write.notesPh': 'ಉದಾ: ಮೀನಾ ಹಿರಿಯ ಸೊಸೆ, ಯಾವಾಗಲೂ ಗೌರವದಿಂದ ಮಾತನಾಡುತ್ತಾಳೆ. ಕಾರ್ತಿಕ್ ಒರಟಾಗಿ, ವೇಗವಾಗಿ ಮಾತನಾಡುತ್ತಾನೆ.',
    'voice.title': 'ಕನ್ನಡ ಧ್ವನಿ',
    'voice.sub': '“ಕನ್ನಡದಲ್ಲಿ ಕೇಳಿ”, ಲೈವ್ ಮತ್ತು ಆಡಿಯೋ ಎಕ್ಸ್‌ಪೋರ್ಟ್‌ಗೆ ಬಳಸಲಾಗುತ್ತದೆ.',
    'voice.female': 'ಮಹಿಳೆಯ ಧ್ವನಿ',
    'voice.male': 'ಪುರುಷನ ಧ್ವನಿ',
    'voice.auto': 'ಯಾರು ಮಾತನಾಡುತ್ತಿದ್ದಾರೆ ಎಂಬುದರ ಮೇಲೆ ಗಂಡು / ಹೆಣ್ಣು ಧ್ವನಿಗೆ ಬದಲಾಯಿಸು',
    'voice.speed': 'ವೇಗ',
    'voice.preview': 'ಮುನ್ನೋಟ',
    'adv.title': 'ಸುಧಾರಿತ',
    'adv.model': 'Claude ಮಾಡೆಲ್',
    'adv.modelHelp': 'ನೀವು ಇಲ್ಲಿ ಬದಲಿಸದ ಹೊರತು Haiku ನಲ್ಲೇ ಇರುತ್ತದೆ. ಹೊಸ Claude ಕೀ ಯಾವಾಗಲೂ Haiku ನಿಂದ ಶುರುವಾಗುತ್ತದೆ.',
    'adv.engine': 'ಅನುವಾದಕ',
    'adv.voice': 'ಧ್ವನಿ ಮಾಡೆಲ್',
    'adv.stt': 'ತಮಿಳು ಮಾತಿನ ಮಾಡೆಲ್',
    'adv.tour': 'ಟ್ಯುಟೋರಿಯಲ್ ಮತ್ತೆ ತೋರಿಸಿ',
    'w.title': 'Anuvaada ಗೆ ಸ್ವಾಗತ',
    'w.sub': 'ತಮಿಳು ಧಾರಾವಾಹಿಯ ಸಂಚಿಕೆಗಳು, ಸಹಜ ಕನ್ನಡದಲ್ಲಿ ಬರೆದು ಹೇಳಲಾಗುತ್ತದೆ. ಮೂರು ಕೀಗಳು ಸಾಕು.',
    'w.k1': '1 · Sarvam AI ಕೀ',
    'w.k2': '2 · Claude ಕೀ',
    'w.k3': '3 · Kenpath Labs ಕೀ',
    'w.later': 'ಕೀ ಅಂಟಿಸಿ (ನಂತರವೂ ಸೇರಿಸಬಹುದು)',
    'w.go': 'ಕೀ ಪರಿಶೀಲಿಸಿ, ಶುರು ಮಾಡಿ',
    'tour.skip': 'ಬಿಟ್ಟುಬಿಡಿ',
    'tour.back': 'ಹಿಂದೆ',
    'tour.next': 'ಮುಂದೆ',

    // ---- text built in app.js (keyed by the English)
    'Not listening': 'ಕೇಳುತ್ತಿಲ್ಲ',
    'Listening': 'ಕೇಳುತ್ತಿದೆ',
    'Speaking Kannada': 'ಕನ್ನಡ ಹೇಳುತ್ತಿದೆ',
    '▶ Start': '▶ ಶುರು',
    '■ Stop': '■ ನಿಲ್ಲಿಸಿ',
    'Listening…': 'ಕೇಳುತ್ತಿದೆ…',
    'Listening again…': 'ಮತ್ತೆ ಕೇಳುತ್ತಿದೆ…',
    'Writing Kannada…': 'ಕನ್ನಡ ಬರೆಯುತ್ತಿದೆ…',
    'Not yet in Kannada': 'ಇನ್ನೂ ಕನ್ನಡದಲ್ಲಿಲ್ಲ',
    'Click ↻ to listen again': 'ಮತ್ತೆ ಕೇಳಲು ↻ ಒತ್ತಿ',
    '(nothing to translate)': '(ಅನುವಾದಿಸಲು ಏನೂ ಇಲ್ಲ)',
    'Could not hear this part.': 'ಈ ಭಾಗ ಕೇಳಿಸಲಿಲ್ಲ.',
    'Could not hear this part: ': 'ಈ ಭಾಗ ಕೇಳಿಸಲಿಲ್ಲ: ',
    'Could not translate: ': 'ಅನುವಾದ ಆಗಲಿಲ್ಲ: ',
    'Time': 'ಸಮಯ',
    'Tamil — as heard': 'ತಮಿಳು — ಕೇಳಿದಂತೆ',
    'Kannada': 'ಕನ್ನಡ',
    '♂ man': '♂ ಗಂಡು',
    '♀ woman': '♀ ಹೆಣ್ಣು',
    '✎ edited': '✎ ತಿದ್ದಲಾಗಿದೆ',
    '✎ Tamil edited': '✎ ತಮಿಳು ತಿದ್ದಲಾಗಿದೆ',
    '✓ Tamil corrected': '✓ ತಮಿಳು ಸರಿಪಡಿಸಲಾಗಿದೆ',
    'Heard as: ': 'ಕೇಳಿದ್ದು: ',
    'Working…': 'ಕೆಲಸ ನಡೆಯುತ್ತಿದೆ…',
    'Needs retry': 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಬೇಕು',
    'Unfinished': 'ಅಪೂರ್ಣ',
    'Ready': 'ಸಿದ್ಧ',
    '{n} lines': '{n} ಸಾಲುಗಳು',
    '1 line': '1 ಸಾಲು',
    '{done} of {n} lines in Kannada': '{n} ರಲ್ಲಿ {done} ಸಾಲು ಕನ್ನಡದಲ್ಲಿ',
    '{n} lines not yet written in Kannada.': '{n} ಸಾಲುಗಳು ಇನ್ನೂ ಕನ್ನಡದಲ್ಲಿ ಬರೆದಿಲ್ಲ.',
    '{n} parts of the episode could not be heard.': 'ಸಂಚಿಕೆಯ {n} ಭಾಗಗಳು ಕೇಳಿಸಲಿಲ್ಲ.',
    'Try again': 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ',
    'Continue': 'ಮುಂದುವರಿಸಿ',
    '{n} lines this session': 'ಈ ಸೆಷನ್‌ನಲ್ಲಿ {n} ಸಾಲುಗಳು',
    'Episodes you open are saved here automatically.': 'ನೀವು ತೆರೆಯುವ ಸಂಚಿಕೆಗಳು ಇಲ್ಲಿ ತಾನಾಗಿಯೇ ಉಳಿಯುತ್ತವೆ.',
    'Kannada will appear here': 'ಕನ್ನಡ ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತದೆ',
    'as each Tamil line is spoken.': 'ಪ್ರತಿ ತಮಿಳು ಸಾಲು ಮಾತನಾಡಿದಂತೆ.',
    'Play the Tamil episode on this laptop (YouTube, Hotstar, Sun NXT, VLC…) and press Start. Kannada appears a few seconds after each line.': 'ತಮಿಳು ಸಂಚಿಕೆಯನ್ನು ಈ ಲ್ಯಾಪ್‌ಟಾಪ್‌ನಲ್ಲಿ ಪ್ಲೇ ಮಾಡಿ (YouTube, Hotstar, Sun NXT, VLC…), ನಂತರ ಶುರು ಒತ್ತಿ. ಪ್ರತಿ ಸಾಲಿನ ಕೆಲವು ಸೆಕೆಂಡುಗಳಲ್ಲಿ ಕನ್ನಡ ಬರುತ್ತದೆ.',
    'Hold the microphone near the speaker or TV and press Start.': 'ಮೈಕ್ರೊಫೋನ್ ಅನ್ನು ಸ್ಪೀಕರ್ ಅಥವಾ ಟಿವಿ ಹತ್ತಿರ ಇಟ್ಟು ಶುರು ಒತ್ತಿ.',
    ' While Kannada is spoken aloud, listening pauses — headphones work best.': ' ಕನ್ನಡ ಹೇಳುವಾಗ ಕೇಳುವುದು ನಿಲ್ಲುತ್ತದೆ — ಹೆಡ್‌ಫೋನ್ ಉತ್ತಮ.',
    'Checking…': 'ಪರಿಶೀಲಿಸುತ್ತಿದೆ…',
    'Check keys & start': 'ಕೀ ಪರಿಶೀಲಿಸಿ, ಶುರು ಮಾಡಿ',
    'Please paste your Sarvam AI key.': 'ದಯವಿಟ್ಟು ನಿಮ್ಮ Sarvam AI ಕೀ ಅಂಟಿಸಿ.',
    '{name}: not set': '{name}: ಇಲ್ಲ',
    '✓ {name} works': '✓ {name} ಕೆಲಸ ಮಾಡುತ್ತಿದೆ',
    'Saved to Episodes.': 'ಸಂಚಿಕೆಗಳಲ್ಲಿ ಉಳಿಸಲಾಗಿದೆ.',
    'Open': 'ತೆರೆಯಿರಿ',
    'All set! Open a Tamil episode to begin.': 'ಎಲ್ಲಾ ಸಿದ್ಧ! ಶುರು ಮಾಡಲು ತಮಿಳು ಸಂಚಿಕೆ ತೆರೆಯಿರಿ.',
    'Ready. Add a Claude key later in Settings for the best Kannada.': 'ಸಿದ್ಧ. ಉತ್ತಮ ಕನ್ನಡಕ್ಕಾಗಿ ನಂತರ ಸೆಟ್ಟಿಂಗ್ಸ್‌ನಲ್ಲಿ Claude ಕೀ ಸೇರಿಸಿ.',

    // dashboard
    'This month': 'ಈ ತಿಂಗಳು',
    'Estimated spend': 'ಅಂದಾಜು ಖರ್ಚು',
    'Key added': 'ಕೀ ಸೇರಿಸಲಾಗಿದೆ',
    'No key': 'ಕೀ ಇಲ್ಲ',
    'Translation': 'ಅನುವಾದ',
    'Hearing Tamil': 'ತಮಿಳು ಕೇಳುವುದು',
    'Kannada voice': 'ಕನ್ನಡ ಧ್ವನಿ',
    'Requests': 'ವಿನಂತಿಗಳು',
    'Tokens in': 'ಒಳಬಂದ ಟೋಕನ್‌ಗಳು',
    'Tokens out': 'ಹೊರಹೋದ ಟೋಕನ್‌ಗಳು',
    'Cached tokens': 'ಕ್ಯಾಶ್ ಟೋಕನ್‌ಗಳು',
    'Audio heard': 'ಕೇಳಿದ ಆಡಿಯೋ',
    'Voice characters': 'ಧ್ವನಿ ಅಕ್ಷರಗಳು',
    'Translated characters': 'ಅನುವಾದಿಸಿದ ಅಕ್ಷರಗಳು',
    'Characters spoken': 'ಹೇಳಿದ ಅಕ್ಷರಗಳು',
    'Free this month': 'ಈ ತಿಂಗಳ ಉಚಿತ',
    'Left on your plan': 'ನಿಮ್ಮ ಪ್ಲಾನ್‌ನಲ್ಲಿ ಉಳಿದಿದೆ',
    'Model': 'ಮಾಡೆಲ್',
    'Open console': 'ಕನ್ಸೋಲ್ ತೆರೆಯಿರಿ',
    'min': 'ನಿಮಿಷ',
    'Reset this month\'s counters?': 'ಈ ತಿಂಗಳ ಎಣಿಕೆಯನ್ನು ಮರುಹೊಂದಿಸಬೇಕೇ?',

    // tutorial (spotlight steps)
    'New episode': 'ಹೊಸ ಸಂಚಿಕೆ',
    'Start here. Pick a Tamil episode (video or audio). Anuvaada listens, fixes the Tamil, and writes every line in natural Kannada.': 'ಇಲ್ಲಿಂದ ಶುರು ಮಾಡಿ. ತಮಿಳು ಸಂಚಿಕೆ (ವಿಡಿಯೋ ಅಥವಾ ಆಡಿಯೋ) ಆಯ್ಕೆಮಾಡಿ. Anuvaada ಕೇಳಿ, ತಮಿಳನ್ನು ಸರಿಪಡಿಸಿ, ಪ್ರತಿ ಸಾಲನ್ನೂ ಸಹಜ ಕನ್ನಡದಲ್ಲಿ ಬರೆಯುತ್ತದೆ.',
    'Drop a file': 'ಫೈಲ್ ಬಿಡಿ',
    'Or just drag the episode file onto this area. Big mp4 and mkv files work too.': 'ಅಥವಾ ಸಂಚಿಕೆಯ ಫೈಲ್ ಅನ್ನು ಈ ಜಾಗಕ್ಕೆ ಎಳೆದು ಬಿಡಿ. ದೊಡ್ಡ mp4, mkv ಫೈಲ್‌ಗಳೂ ಆಗುತ್ತವೆ.',
    'Saved work': 'ಉಳಿಸಿದ ಕೆಲಸ',
    'Every episode you open is saved here automatically. Click one to continue where you left off.': 'ನೀವು ತೆರೆಯುವ ಪ್ರತಿ ಸಂಚಿಕೆಯೂ ಇಲ್ಲಿ ತಾನಾಗಿಯೇ ಉಳಿಯುತ್ತದೆ. ಬಿಟ್ಟಲ್ಲಿಂದ ಮುಂದುವರಿಸಲು ಒಂದನ್ನು ಒತ್ತಿ.',
    'Live': 'ಲೈವ್',
    'Watching on Sun NXT or YouTube? Open Live, press Start, and the Kannada appears as each line is spoken.': 'Sun NXT ಅಥವಾ YouTube ನಲ್ಲಿ ನೋಡುತ್ತಿದ್ದೀರಾ? ಲೈವ್ ತೆರೆದು ಶುರು ಒತ್ತಿ, ಪ್ರತಿ ಸಾಲು ಮಾತನಾಡಿದಂತೆ ಕನ್ನಡ ಬರುತ್ತದೆ.',
    'Settings': 'ಸೆಟ್ಟಿಂಗ್ಸ್',
    'Your keys, Kannada style, character names, voices, and a dashboard of what each service has used this month.': 'ನಿಮ್ಮ ಕೀಗಳು, ಕನ್ನಡ ಶೈಲಿ, ಪಾತ್ರಗಳ ಹೆಸರುಗಳು, ಧ್ವನಿಗಳು, ಮತ್ತು ಪ್ರತಿ ಸೇವೆ ಈ ತಿಂಗಳು ಎಷ್ಟು ಬಳಸಿದೆ ಎಂಬ ಡ್ಯಾಶ್‌ಬೋರ್ಡ್.',
    'English / ಕನ್ನಡ': 'English / ಕನ್ನಡ',
    'Switch the whole app between English and Kannada.': 'ಇಡೀ ಆ್ಯಪ್ ಅನ್ನು English ಮತ್ತು ಕನ್ನಡದ ನಡುವೆ ಬದಲಿಸಿ.',
    'Key status': 'ಕೀ ಸ್ಥಿತಿ',
    'Green means the key is set. Click it to go straight to your keys.': 'ಹಸಿರು ಎಂದರೆ ಕೀ ಸೇರಿಸಲಾಗಿದೆ. ನೇರವಾಗಿ ಕೀಗಳಿಗೆ ಹೋಗಲು ಇದನ್ನು ಒತ್ತಿ.',
    'Open a Tamil episode': 'ತಮಿಳು ಸಂಚಿಕೆ ತೆರೆಯಿರಿ',
    'Drop a video or audio file, or click New episode. Anuvaada listens, fixes the Tamil, and writes every line in natural Kannada. Your work saves itself.': 'ವಿಡಿಯೋ ಅಥವಾ ಆಡಿಯೋ ಫೈಲ್ ಬಿಡಿ, ಅಥವಾ ಹೊಸ ಸಂಚಿಕೆ ಒತ್ತಿ. Anuvaada ಕೇಳಿ, ತಮಿಳನ್ನು ಸರಿಪಡಿಸಿ, ಪ್ರತಿ ಸಾಲನ್ನೂ ಸಹಜ ಕನ್ನಡದಲ್ಲಿ ಬರೆಯುತ್ತದೆ. ಕೆಲಸ ತಾನಾಗಿಯೇ ಉಳಿಯುತ್ತದೆ.',
    'Review line by line': 'ಸಾಲು ಸಾಲಾಗಿ ಪರಿಶೀಲಿಸಿ',
    'Click any Tamil or Kannada line to edit it. Press Enter on the Tamil to rewrite the Kannada. 🔊 plays the Kannada voice, which switches between a man and a woman with the speaker.': 'ತಿದ್ದಲು ಯಾವುದೇ ತಮಿಳು ಅಥವಾ ಕನ್ನಡ ಸಾಲನ್ನು ಒತ್ತಿ. ತಮಿಳಿನಲ್ಲಿ Enter ಒತ್ತಿದರೆ ಕನ್ನಡ ಮತ್ತೆ ಬರೆಯುತ್ತದೆ. 🔊 ಕನ್ನಡ ಧ್ವನಿ ಕೇಳಿಸುತ್ತದೆ; ಮಾತನಾಡುವವರಂತೆ ಗಂಡು / ಹೆಣ್ಣು ಧ್ವನಿ ಬದಲಾಗುತ್ತದೆ.',
    'Translate live': 'ಲೈವ್ ಅನುವಾದ',
    'Playing a serial on Sun NXT or YouTube? Open Live, press Start, and the Kannada appears as each line is spoken.': 'Sun NXT ಅಥವಾ YouTube ನಲ್ಲಿ ಧಾರಾವಾಹಿ ನೋಡುತ್ತಿದ್ದೀರಾ? ಲೈವ್ ತೆರೆದು ಶುರು ಒತ್ತಿ, ಪ್ರತಿ ಸಾಲು ಮಾತನಾಡಿದಂತೆ ಕನ್ನಡ ಬರುತ್ತದೆ.',
    'Keys, costs and language': 'ಕೀಗಳು, ಖರ್ಚು ಮತ್ತು ಭಾಷೆ',
    'Settings shows your keys and what each service has used this month. Switch the whole app between English and ಕನ್ನಡ with the EN / ಕ button at the top.': 'ಸೆಟ್ಟಿಂಗ್ಸ್‌ನಲ್ಲಿ ನಿಮ್ಮ ಕೀಗಳು ಮತ್ತು ಪ್ರತಿ ಸೇವೆ ಈ ತಿಂಗಳು ಎಷ್ಟು ಬಳಸಿದೆ ಎಂದು ಕಾಣುತ್ತದೆ. ಮೇಲಿರುವ EN / ಕ ಬಟನ್‌ನಿಂದ ಆ್ಯಪ್ ಅನ್ನು English ಮತ್ತು ಕನ್ನಡದ ನಡುವೆ ಬದಲಿಸಿ.',
    'Get started': 'ಶುರು ಮಾಡಿ',
  };

  let lang = 'en';
  function fill(s, vars) {
    return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)) : s;
  }
  /** t('English text', { n: 3 }) -> current-language text with {vars} filled in. */
  function t(en, vars) {
    return fill(lang === 'kn' && KN[en] != null ? KN[en] : en, vars);
  }
  /** "{n} lines" with a singular form. */
  function tn(n, en) {
    return n === 1 ? t('1 ' + en.replace(/^\{n\} /, '').replace(/s\b/, ''), { n }) : t(en, { n });
  }
  function apply(next) {
    if (next) lang = next;
    document.documentElement.lang = lang;
    document.documentElement.dataset.lang = lang;
    for (const el of document.querySelectorAll('[data-i18n]')) {
      if (el.dataset.en == null) el.dataset.en = el.innerHTML;
      const k = KN[el.dataset.i18n];
      el.innerHTML = lang === 'kn' && k ? k : el.dataset.en;
    }
    for (const el of document.querySelectorAll('[data-i18n-ph]')) {
      if (el.dataset.enPh == null) el.dataset.enPh = el.placeholder;
      const k = KN[el.dataset.i18nPh];
      el.placeholder = lang === 'kn' && k ? k : el.dataset.enPh;
    }
    for (const el of document.querySelectorAll('[data-i18n-title]')) {
      if (el.dataset.enTitle == null) el.dataset.enTitle = el.title;
      const k = KN[el.dataset.i18nTitle];
      el.title = lang === 'kn' && k ? k : el.dataset.enTitle;
    }
  }
  root.I18N = { t, tn, apply, get lang() { return lang; } };
  root.t = t;
})(window);
