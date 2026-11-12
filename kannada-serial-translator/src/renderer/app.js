/* global AudioKit, VOICES, VOICE_DEFAULTS */
'use strict';
/* `api` is provided by preload.js (window.api) */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

let settings = {};

// ---------------------------------------------------------------- helpers
function toast(msg, kind = '', ms = 4500) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast ' + kind;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), ms);
}
function errMsg(e) {
  const m = String((e && e.message) || e || 'Unknown error');
  return m.replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}
function fmtTime(sec) {
  sec = Math.max(0, sec || 0);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  const mm = String(m).padStart(2, '0'), ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
function srtTime(sec) {
  const ms = Math.round(Math.max(0, sec) * 1000);
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
}
function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
/** Split a transcript into sentences and spread them over [start,end] by length. */
function splitTimed(text, start, end) {
  const parts = String(text).split(/(?<=[.!?।…])\s+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length <= 1) return [{ ta: String(text).trim(), start, end }];
  const total = parts.reduce((n, p) => n + p.length, 0);
  let t = start;
  return parts.map((p) => {
    const d = ((end - start) * p.length) / total;
    const seg = { ta: p, start: t, end: t + d };
    t += d;
    return seg;
  });
}
function toArrayBuffer(u8) {
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
}

// ---------------------------------------------------------------- tabs
$$('.tab').forEach((b) =>
  b.addEventListener('click', () => showTab(b.dataset.tab))
);
function showTab(name) {
  $$('.tab').forEach((x) => x.classList.toggle('active', x.dataset.tab === name));
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + name));
}

function renderKeyStatus() {
  const el = $('#keystatus');
  el.innerHTML = '';
  const mk = (label, ok, warn) => {
    const p = document.createElement('span');
    p.className = 'pill ' + (ok ? 'ok' : warn ? 'bad' : '');
    p.textContent = label + (ok ? ' ✓' : warn ? ' — add key' : ' — optional');
    p.onclick = () => showTab('settings');
    el.appendChild(p);
  };
  mk('Sarvam', settings.sarvamKeySet, true);
  mk('Claude', settings.anthropicKeySet, false);
}

// ---------------------------------------------------------------- voice playback
const Speaker = {
  audio: new Audio(),
  cache: new Map(),
  token: 0,
  onStart: null,
  onEnd: null,
  sig() {
    return [settings.ttsModel, settings.voiceFemale, settings.voiceMale, settings.voiceAuto, settings.pace].join('|');
  },
  async fetch(text, gender) {
    const key = this.sig() + '|' + (settings.voiceAuto ? gender : '') + '|' + text;
    if (!this.cache.has(key)) {
      const p = api.speak(text, gender).then((bufs) => bufs.map((b) => toArrayBuffer(b)));
      this.cache.set(key, p);
      p.catch(() => this.cache.delete(key));
    }
    return this.cache.get(key);
  },
  async playBuffers(bufs, token) {
    for (const b of bufs) {
      if (token !== this.token) return false;
      const url = URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
      try {
        this.audio.src = url;
        await new Promise((resolve, reject) => {
          const done = () => { cleanup(); resolve(); };
          const fail = () => { cleanup(); reject(new Error('Could not play audio')); };
          const cleanup = () => {
            this.audio.removeEventListener('ended', done);
            this.audio.removeEventListener('pause', done);
            this.audio.removeEventListener('error', fail);
          };
          this.audio.addEventListener('ended', done);
          this.audio.addEventListener('pause', done);
          this.audio.addEventListener('error', fail);
          this.audio.play().catch(fail);
        });
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    return token === this.token;
  },
  /** Speak one line. Resolves true if it finished, false if stopped. */
  async say(text, gender) {
    if (!text || !text.trim()) return true;
    const token = ++this.token;
    const bufs = await this.fetch(text, gender);
    if (token !== this.token) return false;
    this.onStart && this.onStart();
    try {
      return await this.playBuffers(bufs, token);
    } finally {
      this.onEnd && this.onEnd();
    }
  },
  stop() {
    this.token++;
    this.audio.pause();
  },
};

// ================================================================ EPISODE
const Episode = {
  project: null,
  samples: null, // decoded 16 kHz audio of the current episode (in memory only)
  job: null,
  els: new Map(),
  speakingAll: false,
  stopAt: null,
};

let saveDirty = false;
const saveProjectDebounced = debounce(() => {
  const p = Episode.project;
  if (!p || !saveDirty) return;
  saveDirty = false;
  p.updatedAt = Date.now();
  api.saveProject(p).then(refreshProjects).catch((e) => toast('Could not save: ' + errMsg(e), 'error'));
}, 700);
function saveProject() {
  saveDirty = true;
  saveProjectDebounced();
}
window.addEventListener('beforeunload', () => {
  if (saveDirty && Episode.project) {
    Episode.project.updatedAt = Date.now();
    api.saveProjectNow(Episode.project);
  }
});

async function refreshProjects() {
  const list = await api.listProjects();
  const ul = $('#projects');
  ul.innerHTML = '';
  if (!list.length) {
    ul.innerHTML = '<li class="hint" style="cursor:default">Nothing yet</li>';
    return;
  }
  for (const p of list) {
    const li = document.createElement('li');
    li.className = Episode.project && Episode.project.id === p.id ? 'active' : '';
    li.innerHTML = `<div class="pname"><div>${escapeHtml(p.name)}</div><div class="pmeta">${p.lines} lines · ${new Date(p.updatedAt).toLocaleDateString()}</div></div><button class="del" title="Delete">✕</button>`;
    li.onclick = (e) => {
      if (e.target.classList.contains('del')) return;
      loadProject(p.id);
    };
    li.querySelector('.del').onclick = async () => {
      if (!confirm(`Delete "${p.name}"? This cannot be undone.`)) return;
      await api.deleteProject(p.id);
      if (Episode.project && Episode.project.id === p.id) closeEpisode();
      refreshProjects();
    };
    ul.appendChild(li);
  }
}

function closeEpisode() {
  cancelJob();
  Episode.project = null;
  Episode.samples = null;
  $('#episode').classList.add('hidden');
  $('#episode-empty').classList.remove('hidden');
}

function cancelJob() {
  if (Episode.job) Episode.job.cancelled = true;
  Episode.job = null;
  $('#progress').classList.add('hidden');
}

const VIDEO_EXT = /\.(mp4|mkv|mov|m4v|webm|avi|ts)$/i;
function setPlayerSource(file) {
  const player = $('#player');
  player.src = file.url; // streamed from disk, never loaded into memory
  player.classList.toggle('audio-only', !VIDEO_EXT.test(file.name));
  player.classList.remove('hidden');
  $('#btn-relink').classList.add('hidden');
  player.onerror = () => {
    if (VIDEO_EXT.test(file.name)) toast('This video format cannot be shown in the app, but its sound can still be translated.', '', 7000);
  };
}

/** Get the episode's audio as 16 kHz mono Float32 samples. */
async function decodeEpisodeAudio(file) {
  const r = await api.decodeAudio(file.path);
  if (r.pcm) {
    const i16 = new Int16Array(r.pcm.buffer, r.pcm.byteOffset, r.pcm.byteLength >> 1);
    const f = new Float32Array(i16.length);
    for (let i = 0; i < i16.length; i++) f[i] = i16[i] / 32768;
    return f;
  }
  return AudioKit.decodeToMono16k(toArrayBuffer(r.bytes));
}

async function openEpisodeFile() {
  if (!settings.sarvamKeySet) {
    toast('Add your Sarvam AI key first (Settings) — it is needed to understand the Tamil audio.', 'error');
    showTab('settings');
    return;
  }
  const file = await api.openMedia();
  if (!file) return;
  cancelJob();
  const project = {
    id: newId(),
    name: file.name.replace(/\.[^.]+$/, ''),
    mediaName: file.name,
    mediaPath: file.path,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    duration: 0,
    lines: [],
    status: 'new',
  };
  showProject(project);
  setPlayerSource(file);
  setProgress(0.01, 'Reading the audio from the file…');
  let samples;
  try {
    samples = await decodeEpisodeAudio(file);
  } catch (e) {
    $('#progress').classList.add('hidden');
    toast('Could not read the sound in this file (' + errMsg(e) + '). Try an .mp4, .mp3 or .wav version of the episode.', 'error', 10000);
    return;
  }
  Episode.samples = samples;
  project.duration = samples.length / AudioKit.SR;
  updateMeta();
  saveProject();
  await runEpisodePipeline(project, samples);
}

function showProject(project) {
  if (saveDirty && Episode.project && Episode.project !== project) {
    saveDirty = false;
    api.saveProject(Episode.project).catch(() => {});
  }
  Episode.project = project;
  $('#episode-empty').classList.add('hidden');
  $('#episode').classList.remove('hidden');
  $('#ep-name').value = project.name;
  renderAllLines();
  updateMeta();
  refreshProjects();
}

async function loadProject(id) {
  if (Episode.job && !confirm('Stop the current translation and open another episode?')) return;
  cancelJob();
  const p = await api.loadProject(id);
  if (!p) return toast('Could not open that project', 'error');
  Episode.samples = null;
  const player = $('#player');
  player.onerror = null;
  player.removeAttribute('src');
  player.load();
  player.classList.add('hidden');
  $('#btn-relink').classList.remove('hidden');
  showProject(p);
  const file = p.mediaPath ? await api.relinkMedia(p.mediaPath) : null;
  if (file) {
    setPlayerSource(file);
    decodeEpisodeAudio(file).then((s) => { if (Episode.project === p) Episode.samples = s; }).catch(() => {});
  }
  if (p.lines.some((l) => l.kn == null && l.ta)) {
    toast('Some lines were not translated yet — continuing.');
    runTranslateOnly(p);
  }
}

$('#btn-relink').onclick = async () => {
  const file = await api.openMedia();
  if (!file) return;
  if (Episode.project) { Episode.project.mediaPath = file.path; saveProject(); }
  setPlayerSource(file);
  decodeEpisodeAudio(file).then((s) => (Episode.samples = s)).catch(() => {});
};

$('#ep-name').addEventListener('input', (e) => {
  if (!Episode.project) return;
  Episode.project.name = e.target.value.trim() || 'Untitled episode';
  saveProject();
});

function updateMeta() {
  const p = Episode.project;
  if (!p) return;
  const done = p.lines.filter((l) => l.kn).length;
  $('#ep-meta').textContent = [p.mediaName, p.duration ? fmtTime(p.duration) : '', `${p.lines.length} lines`, p.lines.length ? `${done} in Kannada` : '']
    .filter(Boolean).join(' · ');
}

function setProgress(frac, text) {
  $('#progress').classList.remove('hidden');
  $('#progress-fill').style.width = Math.round(Math.min(1, Math.max(0, frac)) * 100) + '%';
  $('#progress-text').textContent = text;
}
$('#btn-cancel').onclick = () => {
  cancelJob();
  toast('Stopped. What is done so far is saved.');
};

// ---------- the pipeline: listen (Sarvam STT) -> translate (Claude) ----------
const BATCH = 30;

async function runEpisodePipeline(project, samples) {
  const job = { cancelled: false };
  Episode.job = job;
  const sr = AudioKit.SR;
  const chunks = AudioKit.segmentBySilence(samples, sr).map((c, i) => ({ ...c, i, s0: c.start / sr, s1: c.end / sr }));
  const results = new Array(chunks.length);
  let next = 0, transcribed = 0, sttDone = false, fatal = null, failed = 0;
  let lineNo = project.lines.length;
  let wake = null;
  const poke = () => { if (wake) { const w = wake; wake = null; w(); } };

  project.status = 'working';
  const report = () => {
    const tr = project.lines.filter((l) => l.kn != null).length;
    const tot = project.lines.length;
    const f = 0.65 * (transcribed / chunks.length) + 0.35 * (tot ? tr / tot : 0) * (transcribed / chunks.length);
    setProgress(f, `Listening to the Tamil audio: ${transcribed}/${chunks.length} parts · Kannada lines ready: ${tr}/${tot}`);
  };
  report();

  // Hand results to the page in the original order.
  const emit = () => {
    while (next < chunks.length && results[next] !== undefined) {
      for (const seg of results[next]) {
        const line = { id: 'L' + ++lineNo, start: seg.start, end: seg.end, ta: seg.ta, kn: seg.ta ? null : '', gender: 'unknown', note: '', chunk: [chunks[next].s0, chunks[next].s1] };
        if (seg.error) line.error = seg.error;
        project.lines.push(line);
        addLineEl(line);
      }
      next++;
    }
    updateMeta();
    saveProject();
    poke();
  };

  const sttOne = async (c) => {
    if (!c.speech) return [];
    const wav = AudioKit.encodeWav(AudioKit.normalize(samples.subarray(c.start, c.end)), sr);
    const r = await api.transcribe(wav, true);
    if (r.segments && r.segments.length) {
      return r.segments.map((s) => ({ ta: s.text, start: c.s0 + s.start, end: c.s0 + Math.max(s.end, s.start + 0.5) }));
    }
    return r.transcript ? splitTimed(r.transcript, c.s0, c.s1) : [];
  };

  const queue = chunks.slice();
  const worker = async () => {
    while (queue.length && !job.cancelled && !fatal) {
      const c = queue.shift();
      try {
        results[c.i] = await sttOne(c);
      } catch (e) {
        const m = errMsg(e);
        if (/key|401|403/i.test(m)) fatal = m;
        failed++;
        results[c.i] = [{ ta: '', start: c.s0, end: c.s1, error: m }];
      }
      transcribed++;
      if (!job.cancelled) { emit(); report(); }
    }
  };

  const translateLoop = async () => {
    for (;;) {
      if (job.cancelled) return;
      const pending = project.lines.filter((l) => l.kn == null);
      if (pending.length >= BATCH || (sttDone && pending.length)) {
        await translateBatch(project, pending.slice(0, BATCH), job);
        report();
        continue;
      }
      if (sttDone) return;
      await new Promise((r) => (wake = r));
    }
  };

  const tl = translateLoop().catch((e) => {
    if (!job.cancelled) toast('Translation stopped: ' + errMsg(e), 'error', 9000);
  });
  await Promise.all([worker(), worker(), worker(), worker()]);
  sttDone = true;
  poke();
  await tl;

  if (job.cancelled) return;
  Episode.job = null;
  project.status = 'done';
  saveProject();
  $('#progress').classList.add('hidden');
  if (fatal) toast(fatal, 'error', 10000);
  else if (failed) toast(`${failed} part(s) could not be heard — use ↻ on the red lines to retry.`, 'error', 8000);
  else toast('Done! The whole episode is in Kannada. Click 🔊 on any line, or "Speak all".');
}

async function runTranslateOnly(project, lines) {
  const job = { cancelled: false };
  Episode.job = job;
  const todo = lines || project.lines.filter((l) => l.kn == null);
  let done = 0;
  try {
    for (let i = 0; i < todo.length && !job.cancelled; i += BATCH) {
      setProgress(done / todo.length, `Writing Kannada: ${done}/${todo.length} lines`);
      const b = todo.slice(i, i + BATCH);
      await translateBatch(project, b, job);
      done += b.length;
    }
  } catch (e) {
    toast('Translation stopped: ' + errMsg(e), 'error', 9000);
  }
  if (Episode.job === job) {
    Episode.job = null;
    $('#progress').classList.add('hidden');
  }
}

async function translateBatch(project, batch, job) {
  const firstIdx = project.lines.indexOf(batch[0]);
  const context = project.lines
    .slice(Math.max(0, firstIdx - 15), firstIdx)
    .filter((l) => l.kn)
    .map((l) => ({ ta: l.ta, kn: l.kn }));
  const res = await api.translate(batch.map((l) => ({ id: l.id, ta: l.ta })), context, false);
  if (job && job.cancelled) return;
  if (res.warning) toast(res.warning, 'error', 7000);
  const byId = new Map(res.lines.map((r) => [r.id, r]));
  for (const l of batch) {
    const r = byId.get(l.id);
    if (!r) continue;
    l.kn = r.kn;
    l.gender = r.gender || 'unknown';
    l.note = r.note || '';
    l.engine = res.engine;
    l.edited = false;
    updateLineEl(l);
  }
  updateMeta();
  saveProject();
}

// ---------- line list ----------
function renderAllLines() {
  const box = $('#lines');
  box.innerHTML = '<div class="lines-head"><div>Time</div><div>Tamil (heard)</div><div>Kannada</div><div></div></div>';
  Episode.els.clear();
  for (const l of Episode.project.lines) addLineEl(l);
  applySearch();
}

function addLineEl(line) {
  const el = document.createElement('div');
  el.className = 'line';
  el.dataset.id = line.id;
  el.innerHTML = `
    <div class="time" title="Play the original Tamil">${fmtTime(line.start)}</div>
    <div class="ta"></div>
    <div><div class="kn" contenteditable="true" spellcheck="false"></div><div class="note"></div></div>
    <div class="acts">
      <button class="icon" data-act="orig" title="Play original Tamil">▶</button>
      <button class="icon" data-act="speak" title="Speak in Kannada">🔊</button>
      <button class="icon" data-act="redo" title="Translate this line again">↻</button>
    </div>`;
  $('#lines').appendChild(el);
  Episode.els.set(line.id, el);
  const kn = $('.kn', el);
  kn.addEventListener('input', () => {
    line.kn = kn.innerText.trim();
    line.edited = true;
    kn.classList.add('edited');
    saveProject();
  });
  kn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); kn.blur(); }
  });
  $('.time', el).onclick = () => playOriginal(line);
  el.querySelector('[data-act=orig]').onclick = () => playOriginal(line);
  el.querySelector('[data-act=speak]').onclick = () => speakLine(line);
  el.querySelector('[data-act=redo]').onclick = () => redoLine(line);
  updateLineEl(line);
}

function updateLineEl(line) {
  const el = Episode.els.get(line.id);
  if (!el) return;
  const ta = $('.ta', el);
  if (line.error) {
    ta.innerHTML = `<span style="color:var(--red)">Could not hear this part — click ↻ to retry.</span>`;
    ta.title = line.error;
  } else ta.textContent = line.ta;
  const kn = $('.kn', el);
  if (document.activeElement !== kn) kn.textContent = line.kn || '';
  kn.dataset.placeholder = line.error ? '' : line.kn == null ? 'writing Kannada…' : line.ta ? '(no speech)' : '';
  kn.classList.toggle('edited', !!line.edited);
  const g = line.gender === 'male' ? '♂ ' : line.gender === 'female' ? '♀ ' : '';
  $('.note', el).textContent = (g && settings.voiceAuto ? g : '') + (line.note || '');
}

async function playOriginal(line) {
  const player = $('#player');
  if (!player.src) return toast('Open the episode file (button above the list) to hear the original audio.');
  Speaker.stop();
  player.currentTime = Math.max(0, line.start - 0.15);
  Episode.stopAt = line.end + 0.3;
  player.play();
}

async function speakLine(line) {
  if (!line.kn) return toast('This line has no Kannada text yet.');
  $('#player').pause();
  markSpeaking(line);
  try {
    await Speaker.say(line.kn, line.gender);
  } catch (e) {
    toast('Voice failed: ' + errMsg(e), 'error');
  } finally {
    markSpeaking(null);
  }
}

function markSpeaking(line) {
  $$('.line.speaking').forEach((x) => x.classList.remove('speaking'));
  if (!line) return;
  const el = Episode.els.get(line.id);
  if (el) {
    el.classList.add('speaking');
    if ($('#follow').checked) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
}

async function redoLine(line) {
  const p = Episode.project;
  if (line.error || (!line.ta && line.chunk)) {
    if (!Episode.samples) return toast('Open the episode file first (button above the list) so it can be listened to again.');
    const el = Episode.els.get(line.id);
    $('.kn', el).dataset.placeholder = 'listening again…';
    try {
      const [s0, s1] = line.chunk;
      const sr = AudioKit.SR;
      const wav = AudioKit.encodeWav(AudioKit.normalize(Episode.samples.subarray(Math.floor(s0 * sr), Math.floor(s1 * sr))), sr);
      const r = await api.transcribe(wav, false);
      delete line.error;
      line.ta = r.transcript || '';
      line.kn = line.ta ? null : '';
    } catch (e) {
      line.error = errMsg(e);
      updateLineEl(line);
      return toast(errMsg(e), 'error');
    }
  }
  if (!line.ta) { updateLineEl(line); return; }
  line.kn = null;
  line.edited = false;
  updateLineEl(line);
  try {
    await translateBatch(p, [line], null);
  } catch (e) {
    toast(errMsg(e), 'error');
    updateLineEl(line);
  }
}

$('#btn-retranslate-all').onclick = () => {
  const p = Episode.project;
  if (!p || Episode.job) return;
  const lines = p.lines.filter((l) => l.ta && !l.edited);
  if (!lines.length) return;
  if (!confirm(`Translate ${lines.length} lines again with the current style, glossary and notes? Lines you edited by hand are kept.`)) return;
  for (const l of lines) { l.kn = null; updateLineEl(l); }
  runTranslateOnly(p, lines);
};

// follow playback + stop at end of a single line
$('#player').addEventListener('timeupdate', () => {
  const player = $('#player');
  const t = player.currentTime;
  if (Episode.stopAt != null && t >= Episode.stopAt) {
    Episode.stopAt = null;
    player.pause();
  }
  const p = Episode.project;
  if (!p || !p.lines.length) return;
  let lo = 0, hi = p.lines.length - 1, idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (p.lines[mid].start <= t) { idx = mid; lo = mid + 1; } else hi = mid - 1;
  }
  const cur = idx >= 0 ? p.lines[idx] : null;
  if (cur && cur.id !== Episode.currentId) {
    Episode.currentId = cur.id;
    $$('.line.current').forEach((x) => x.classList.remove('current'));
    const el = Episode.els.get(cur.id);
    if (el) {
      el.classList.add('current');
      if ($('#follow').checked && !player.paused) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }
});
$('#player').addEventListener('seeking', () => { if (!$('#player').paused) Episode.stopAt = null; });
$('#player').addEventListener('play', () => { if (Episode.speakingAll) stopSpeakAll(); });

// speak all
$('#btn-speak-all').onclick = async () => {
  const p = Episode.project;
  if (!p) return;
  const lines = p.lines.filter((l) => l.kn);
  if (!lines.length) return toast('No Kannada lines yet.');
  const startIdx = Math.max(0, lines.findIndex((l) => l.id === Episode.currentId));
  $('#player').pause();
  Episode.speakingAll = true;
  $('#btn-stop-speak').classList.remove('hidden');
  $('#btn-speak-all').classList.add('hidden');
  try {
    for (let i = startIdx; i < lines.length && Episode.speakingAll; i++) {
      if (lines[i + 1]) Speaker.fetch(lines[i + 1].kn, lines[i + 1].gender).catch(() => {}); // prefetch
      markSpeaking(lines[i]);
      Episode.currentId = lines[i].id;
      const finished = await Speaker.say(lines[i].kn, lines[i].gender);
      if (!finished) break;
    }
  } catch (e) {
    toast('Voice failed: ' + errMsg(e), 'error');
  }
  stopSpeakAll();
};
function stopSpeakAll() {
  Episode.speakingAll = false;
  Speaker.stop();
  markSpeaking(null);
  $('#btn-stop-speak').classList.add('hidden');
  $('#btn-speak-all').classList.remove('hidden');
}
$('#btn-stop-speak').onclick = stopSpeakAll;

// search
$('#search').addEventListener('input', debounce(applySearch, 150));
function applySearch() {
  const q = $('#search').value.trim().toLowerCase();
  if (!Episode.project) return;
  for (const l of Episode.project.lines) {
    const el = Episode.els.get(l.id);
    if (el) el.classList.toggle('hidden', !!q && !(`${l.ta} ${l.kn || ''}`.toLowerCase().includes(q)));
  }
}

// ---------- export ----------
$('#btn-export').onclick = (e) => {
  e.stopPropagation();
  $('#export-menu').classList.toggle('hidden');
};
document.addEventListener('click', () => $('#export-menu').classList.add('hidden'));
$$('#export-menu button').forEach((b) => (b.onclick = () => exportAs(b.dataset.export)));

async function exportAs(kind) {
  const p = Episode.project;
  if (!p) return;
  const lines = p.lines.filter((l) => l.kn);
  if (!lines.length) return toast('Nothing to export yet.');
  const base = p.name.replace(/[\\/:*?"<>|]/g, '_');
  let saved = null;
  try {
    if (kind === 'txt') {
      const text = `${p.name}\n\n` + lines.map((l) => `[${fmtTime(l.start)}] ${l.kn}`).join('\n') + '\n';
      saved = await api.saveFile({ defaultName: base + ' - Kannada.txt', filters: [{ name: 'Text', extensions: ['txt'] }], data: text });
    } else if (kind === 'srt') {
      const srt = lines.map((l, i) => `${i + 1}\n${srtTime(l.start)} --> ${srtTime(Math.max(l.end, l.start + 1))}\n${l.kn}\n`).join('\n');
      saved = await api.saveFile({ defaultName: base + ' - Kannada.srt', filters: [{ name: 'Subtitles', extensions: ['srt'] }], data: srt });
    } else if (kind === 'csv') {
      const q = (s) => '"' + String(s ?? '').replace(/"/g, '""') + '"';
      const csv = '﻿' + ['Time,Tamil,Kannada,Speaker,Note', ...p.lines.map((l) => [fmtTime(l.start), l.ta, l.kn || '', l.gender, l.note || ''].map(q).join(','))].join('\r\n');
      saved = await api.saveFile({ defaultName: base + ' - Tamil-Kannada.csv', filters: [{ name: 'CSV', extensions: ['csv'] }], data: csv });
    } else if (kind === 'doc') {
      const rows = p.lines.map((l) => `<tr><td>${fmtTime(l.start)}</td><td class="ta">${escapeHtml(l.ta)}</td><td class="kn">${escapeHtml(l.kn || '')}</td><td>${escapeHtml(l.note || '')}</td></tr>`).join('');
      const html = `<html><head><meta charset="utf-8"><title>${escapeHtml(p.name)}</title><style>body{font-family:'Nirmala UI','Noto Sans Kannada',sans-serif}td{vertical-align:top;padding:4px 8px;border-bottom:1px solid #ccc}.kn{font-size:14pt}.ta{color:#555}</style></head><body><h1>${escapeHtml(p.name)}</h1><table><tr><th>Time</th><th>Tamil</th><th>Kannada</th><th>Note</th></tr>${rows}</table></body></html>`;
      saved = await api.saveFile({ defaultName: base + ' - script.doc', filters: [{ name: 'Word document', extensions: ['doc'] }], data: html });
    } else if (kind === 'wav' || kind === 'dub') {
      saved = await exportVoice(p, lines, kind === 'dub', base);
    }
  } catch (e) {
    $('#progress').classList.add('hidden');
    return toast('Export failed: ' + errMsg(e), 'error');
  }
  if (saved) toast('Saved: ' + saved);
}

async function exportVoice(p, lines, timed, base) {
  if (Episode.job) return toast('Wait for the translation to finish first.');
  const job = { cancelled: false };
  Episode.job = job;
  const all = [];
  try {
    for (let i = 0; i < lines.length; i++) {
      if (job.cancelled) return null;
      setProgress(i / lines.length, `Recording Kannada voice: ${i}/${lines.length} lines`);
      const bufs = await Speaker.fetch(lines[i].kn, lines[i].gender);
      all.push({ line: lines[i], bufs });
    }
  } finally {
    if (Episode.job === job) Episode.job = null;
  }
  setProgress(1, 'Putting the audio together…');
  const RATE = 24000;
  const ctx = new AudioContext({ sampleRate: RATE });
  let out;
  try {
    const decoded = [];
    for (const { line, bufs } of all) {
      const parts = [];
      for (const b of bufs) parts.push((await ctx.decodeAudioData(b.slice(0))).getChannelData(0));
      const len = parts.reduce((n, x) => n + x.length, 0);
      const merged = new Float32Array(len);
      let o = 0;
      for (const x of parts) { merged.set(x, o); o += x.length; }
      decoded.push({ line, data: merged });
    }
    const gap = Math.round(0.35 * RATE);
    let total = 0;
    const placed = [];
    let cursor = 0;
    for (const d of decoded) {
      // timed: start each line where it was spoken in the episode (never overlapping)
      const at = timed ? Math.max(cursor, Math.round(d.line.start * RATE)) : cursor;
      placed.push(at);
      cursor = at + d.data.length + (timed ? Math.round(0.1 * RATE) : gap);
      total = Math.max(total, at + d.data.length);
    }
    if (timed && p.duration) total = Math.max(total, Math.round(p.duration * RATE));
    out = new Float32Array(total + RATE / 2);
    decoded.forEach((d, i) => out.set(d.data, placed[i]));
  } finally {
    ctx.close();
  }
  $('#progress').classList.add('hidden');
  const wav = AudioKit.encodeWav(out, RATE);
  return api.saveFile({
    defaultName: base + (timed ? ' - Kannada dub track.wav' : ' - Kannada voice.wav'),
    filters: [{ name: 'WAV audio', extensions: ['wav'] }],
    data: new Uint8Array(wav),
    encoding: 'binary',
  });
}

$('#btn-open').onclick = openEpisodeFile;
$('#btn-open-2').onclick = openEpisodeFile;

// ================================================================ LIVE
const Live = {
  source: 'system',
  running: false,
  stream: null,
  ctx: null,
  seg: null,
  lines: [],
  t0: 0,
  translateChain: Promise.resolve(),
  speakChain: Promise.resolve(),
  paused: false,
  n: 0,
};

$$('#live-source button').forEach((b) =>
  b.addEventListener('click', () => {
    if (Live.running) return toast('Stop listening first to change the source.');
    Live.source = b.dataset.src;
    $$('#live-source button').forEach((x) => x.classList.toggle('on', x === b));
    $('#mic-field').classList.toggle('hidden', Live.source !== 'mic');
    $('#live-hint').textContent = Live.source === 'mic'
      ? 'Speak or play the Tamil episode near the microphone and press Start. Each line appears in Kannada a few seconds after it is spoken. Use headphones if "Speak Kannada aloud" is on.'
      : 'Play the Tamil episode (YouTube, Hotstar, Sun NXT, VLC…) on this laptop and press Start. Each line appears in Kannada a few seconds after it is spoken. While Kannada is being spoken aloud, listening pauses so the app does not hear itself — use headphones for the best result.';
    if (Live.source === 'mic') listMics();
  })
);
$('#mic-field').classList.add('hidden');

async function listMics() {
  try {
    await api.ensureMic();
    const devs = await navigator.mediaDevices.enumerateDevices();
    let mics = devs.filter((d) => d.kind === 'audioinput');
    if (mics.length && !mics[0].label) {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
      mics = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
    }
    const sel = $('#mic-select');
    sel.innerHTML = mics.map((m) => `<option value="${escapeHtml(m.deviceId)}">${escapeHtml(m.label || 'Microphone')}</option>`).join('') || '<option value="">No microphone found</option>';
  } catch (e) {
    toast('Microphone access was blocked. Allow it in your system privacy settings.', 'error', 8000);
  }
}

$('#btn-live').onclick = () => (Live.running ? stopLive() : startLive());

async function startLive() {
  if (!settings.sarvamKeySet) {
    toast('Add your Sarvam AI key first (Settings).', 'error');
    return showTab('settings');
  }
  let stream;
  try {
    if (Live.source === 'mic') {
      await api.ensureMic();
      const id = $('#mic-select').value;
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: id ? { exact: id } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
    } else {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      stream.getVideoTracks().forEach((t) => { t.stop(); stream.removeTrack(t); });
      if (!stream.getAudioTracks().length) throw new Error('NO_SYSTEM_AUDIO');
    }
  } catch (e) {
    if (e.message === 'NO_SYSTEM_AUDIO' || Live.source === 'system') {
      toast('This computer did not allow capturing its own sound. On a Mac: System Settings → Privacy & Security → Screen & System Audio Recording → allow Anuvaada, then restart the app. Or use Microphone mode.', 'error', 12000);
    } else toast('Could not open the microphone: ' + errMsg(e), 'error', 8000);
    return;
  }

  const ctx = new AudioContext({ sampleRate: AudioKit.SR });
  await ctx.audioWorklet.addModule('capture-worklet.js');
  const src = ctx.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(ctx, 'capture-processor');
  src.connect(node);
  node.connect(ctx.destination); // outputs silence; keeps the worklet running
  Live.seg = new AudioKit.LiveSegmenter(onLiveChunk);
  node.port.onmessage = (e) => {
    if (Live.paused) return;
    Live.seg.push(e.data);
    const pct = Math.max(0, Math.min(100, (Live.seg.level + 60) * 1.8));
    $('#meter').style.width = pct + '%';
  };
  stream.getAudioTracks()[0].addEventListener('ended', () => Live.running && stopLive());
  Object.assign(Live, { running: true, stream, ctx, t0: performance.now() });
  if (!Live.lines.length) $('#live-feed').innerHTML = '';
  $('#btn-live').textContent = '■ Stop listening';
  $('#btn-live').classList.replace('primary', 'danger');
  setLiveState('Listening…', true);
}

function stopLive() {
  if (Live.seg) Live.seg.flush();
  Live.running = false;
  Live.stream && Live.stream.getTracks().forEach((t) => t.stop());
  Live.ctx && Live.ctx.close();
  Live.stream = Live.ctx = null;
  $('#meter').style.width = '0';
  $('#btn-live').textContent = '▶ Start listening';
  $('#btn-live').classList.replace('danger', 'primary');
  setLiveState('Not listening', false);
}

function setLiveState(text, on) {
  const s = $('#live-state');
  s.textContent = text;
  s.classList.toggle('on', !!on);
}

function onLiveChunk(samples) {
  const t = (performance.now() - Live.t0) / 1000 - samples.length / AudioKit.SR;
  const line = { id: 'V' + ++Live.n, start: Math.max(0, t), end: Math.max(0, t) + samples.length / AudioKit.SR, ta: null, kn: null, gender: 'unknown' };
  Live.lines.push(line);
  const el = document.createElement('div');
  el.className = 'live-item';
  el.innerHTML = `<div class="meta">${fmtTime(line.start)}</div><div class="ta">…</div><div class="kn pending">listening…</div>`;
  const feed = $('#live-feed');
  const atBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 80;
  feed.appendChild(el);
  if (atBottom) feed.scrollTop = feed.scrollHeight;

  const wav = AudioKit.encodeWav(AudioKit.normalize(samples), AudioKit.SR);
  const stt = api.transcribe(wav, false);
  const step = Live.translateChain.then(async () => {
    let r;
    try {
      r = await stt;
    } catch (e) {
      $('.kn', el).textContent = 'Could not hear: ' + errMsg(e);
      return;
    }
    line.ta = r.transcript || '';
    if (!line.ta) { el.remove(); Live.lines.splice(Live.lines.indexOf(line), 1); return; }
    $('.ta', el).textContent = line.ta;
    $('.kn', el).textContent = 'writing Kannada…';
    const context = Live.lines.filter((l) => l.kn).slice(-10).map((l) => ({ ta: l.ta, kn: l.kn }));
    try {
      const res = await api.translate([{ id: line.id, ta: line.ta }], context, true);
      const out = res.lines[0] || {};
      line.kn = out.kn || '';
      line.gender = out.gender || 'unknown';
      const knEl = $('.kn', el);
      knEl.classList.remove('pending');
      knEl.textContent = line.kn || '(no speech)';
      if (feed.scrollHeight - feed.scrollTop - feed.clientHeight < 200) feed.scrollTop = feed.scrollHeight;
      if (line.kn && $('#live-speak').checked) {
        Live.speakChain = Live.speakChain.then(() => Speaker.say(line.kn, line.gender)).catch((e) => toast('Voice failed: ' + errMsg(e), 'error'));
      }
    } catch (e) {
      $('.kn', el).textContent = 'Could not translate: ' + errMsg(e);
    }
  });
  Live.translateChain = step.catch(() => {});
}

// While the app speaks Kannada during Live, don't listen (it would hear itself).
Speaker.onStart = () => {
  if (Live.running && $('#live-speak').checked) {
    Live.paused = true;
    setLiveState('Speaking Kannada…', true);
  }
};
Speaker.onEnd = () => {
  if (Live.paused) {
    Live.paused = false;
    Live.seg && Live.seg.reset();
    if (Live.running) setLiveState('Listening…', true);
  }
};

$('#btn-live-clear').onclick = () => {
  if (Live.lines.length && !confirm('Clear the live transcript?')) return;
  Live.lines = [];
  $('#live-feed').innerHTML = '<div class="live-empty">Kannada lines will appear here as the Tamil dialogue is spoken.</div>';
};

$('#btn-live-save').onclick = async () => {
  const lines = Live.lines.filter((l) => l.ta);
  if (!lines.length) return toast('Nothing heard yet.');
  const name = 'Live session ' + new Date().toLocaleString();
  const project = {
    id: newId(), name, mediaName: 'Live capture', createdAt: Date.now(), updatedAt: Date.now(),
    duration: lines[lines.length - 1].end, status: 'done',
    lines: lines.map((l, i) => ({ id: 'L' + (i + 1), start: l.start, end: l.end, ta: l.ta, kn: l.kn, gender: l.gender, note: '' })),
  };
  await api.saveProject(project);
  await refreshProjects();
  toast('Saved to Episode → Saved work. You can edit and export it there.');
};

// ================================================================ SETTINGS
const FIELDS = ['sarvamKey', 'anthropicKey', 'kannadaStyle', 'translationEngine', 'glossary', 'storyNotes', 'ttsModel', 'voiceFemale', 'voiceMale', 'voiceAuto', 'pace', 'sttModel'];

function fillVoiceSelects() {
  const model = $('#ttsModel').value;
  const v = VOICES[model] || VOICES['bulbul:v3'];
  const all = [...v.female.map((x) => [x, '♀']), ...v.male.map((x) => [x, '♂'])];
  const opts = all.map(([x, g]) => `<option value="${x}">${g} ${x.replace(/_kn_/, ' · ').replace(/_/g, ' ')}</option>`).join('');
  $('#voiceFemale').innerHTML = opts;
  $('#voiceMale').innerHTML = opts;
  const def = VOICE_DEFAULTS[model];
  const has = (x) => all.some(([n]) => n === x);
  $('#voiceFemale').value = has(settings.voiceFemale) ? settings.voiceFemale : def.female;
  $('#voiceMale').value = has(settings.voiceMale) ? settings.voiceMale : def.male;
}

function loadSettingsForm() {
  for (const f of FIELDS) {
    const el = $('#' + f);
    if (!el) continue;
    if (el.type === 'checkbox') el.checked = !!settings[f];
    else el.value = settings[f] ?? '';
  }
  fillVoiceSelects();
  $('#pace-val').textContent = Number(settings.pace || 1).toFixed(2) + '×';
}

function readSettingsForm() {
  const patch = {};
  for (const f of FIELDS) {
    const el = $('#' + f);
    if (!el) continue;
    patch[f] = el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value;
  }
  return patch;
}

const autosaveSettings = debounce(async () => {
  settings = await api.saveSettings(readSettingsForm());
  renderKeyStatus();
}, 500);

for (const f of FIELDS) {
  const el = $('#' + f);
  if (!el) continue;
  el.addEventListener(el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input', () => {
    if (f === 'ttsModel') fillVoiceSelects();
    if (f === 'pace') $('#pace-val').textContent = Number(el.value).toFixed(2) + '×';
    if (f === 'sarvamKey' || f === 'anthropicKey') return; // saved by the button / on blur
    autosaveSettings();
  });
}
['sarvamKey', 'anthropicKey'].forEach((f) => $('#' + f).addEventListener('change', autosaveSettings));

$('#btn-test').onclick = async () => {
  const out = $('#test-result');
  out.textContent = 'Testing…';
  settings = await api.saveSettings(readSettingsForm());
  loadSettingsForm();
  renderKeyStatus();
  const r = await api.testKeys();
  const part = (name, x) =>
    x == null ? `<span>${name}: not set</span>` : x.ok ? `<span class="ok">${name} ✓ ${escapeHtml(x.sample || '')}</span>` : `<span class="bad">${name} ✗ ${escapeHtml(x.error)}</span>`;
  out.innerHTML = part('Sarvam', r.sarvam) + ' &nbsp; ' + part('Claude', r.anthropic);
};

$('#btn-preview-voice').onclick = async () => {
  settings = await api.saveSettings(readSettingsForm());
  try {
    await Speaker.say('ನಮಸ್ಕಾರ! ಇದು ನಿಮ್ಮ ಕನ್ನಡ ಧ್ವನಿ. ಹೇಗಿದೆ ಹೇಳಿ?', 'female');
    if (settings.voiceAuto) await Speaker.say('ಏನಮ್ಮಾ, ಊಟ ಆಯ್ತಾ? ನಾನು ಸ್ವಲ್ಪ ಹೊತ್ತಲ್ಲಿ ಬರ್ತೀನಿ.', 'male');
  } catch (e) {
    toast('Voice preview failed: ' + errMsg(e), 'error', 8000);
  }
};

// ================================================================ boot
(async function boot() {
  settings = await api.getSettings();
  loadSettingsForm();
  renderKeyStatus();
  refreshProjects();
  const info = await api.appInfo();
  $('#app-version').textContent = `Anuvaada ${info.version}`;
  if (!settings.sarvamKeySet) {
    showTab('settings');
    toast('Welcome! Paste your Sarvam AI key (and Claude key for best Kannada) to begin.', '', 9000);
  }
})();

// keyboard: space = play/pause original (when not typing)
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select, [contenteditable]')) return;
  if (e.code === 'Space' && $('#view-episode').classList.contains('active') && $('#player').src) {
    e.preventDefault();
    const p = $('#player');
    p.paused ? p.play() : p.pause();
  }
});
