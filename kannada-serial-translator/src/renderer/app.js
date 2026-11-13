/* global AudioKit, VOICES, VOICE_DEFAULTS, VOICE_NAMES, I18N, t, api */
'use strict';
// `api` is provided by preload.js (window.api).

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
let settings = {};

// ================================================================ helpers
function errMsg(e) {
  return String((e && e.message) || e || 'Unknown error').replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
}
function fmtTime(sec) {
  sec = Math.max(0, sec || 0);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
  const mm = String(m).padStart(2, '0'), ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
function srtTime(sec) {
  const ms = Math.round(Math.max(0, sec) * 1000);
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor((ms % 3600000) / 60000))}:${p(Math.floor((ms % 60000) / 1000))},${p(ms % 1000, 3)}`;
}
function debounce(fn, ms) {
  let t;
  const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  d.cancel = () => clearTimeout(t);
  return d;
}
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const escapeHtml = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const toArrayBuffer = (u8) => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* not critical */ } },
};

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

// ================================================================ toast
function toast(msg, opts = {}) {
  const { kind = '', ms = 4500, action, onAction } = typeof opts === 'string' ? { kind: opts } : opts;
  const t = $('#toast');
  $('#toast-text').textContent = msg;
  const b = $('#toast-btn');
  b.classList.toggle('hidden', !action);
  b.textContent = action || '';
  b.onclick = () => { t.classList.add('hidden'); onAction && onAction(); };
  t.className = 'toast ' + kind;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), ms);
}

// ================================================================ navigation
function showTab(name) {
  $$('.tab').forEach((x) => {
    const on = x.dataset.tab === name;
    x.classList.toggle('active', on);
    x.setAttribute('aria-selected', on);
  });
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + name));
  if (name === 'settings') renderDashboard();
}
$$('.tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
$('#keystatus').onclick = () => showTab('settings');

function renderKeyStatus() {
  const dot = (ok, required) => `<i class="d ${ok ? 'ok' : required ? 'bad' : ''}"></i>`;
  $('#keystatus').innerHTML =
    `<span class="k">${dot(settings.sarvamKeySet, true)}Sarvam</span><span class="k">${dot(settings.anthropicKeySet, false)}Claude</span><span class="k">${dot(settings.kenpathKeySet, false)}Kenpath</span>`;
  $('#keystatus').title = settings.sarvamKeySet ? 'API keys' : 'Sarvam key missing. Click to add.';
}

// menus: one open at a time, close on outside click / Escape
function bindMenu(btn, menu) {
  $(btn).addEventListener('click', (e) => {
    e.stopPropagation();
    const open = $(menu).classList.contains('hidden');
    closeMenus();
    if (open) $(menu).classList.remove('hidden');
  });
  $(menu).addEventListener('click', () => closeMenus());
}
function closeMenus() { $$('.menu').forEach((m) => m.classList.add('hidden')); }
document.addEventListener('click', closeMenus);

// ================================================================ Kannada voice
const Speaker = {
  audio: new Audio(),
  cache: new Map(),
  token: 0,
  onStart: null,
  onEnd: null,
  sig() { return [settings.ttsModel, settings.kenpathKeySet, settings.voiceFemale, settings.voiceMale, settings.voiceAuto, settings.pace].join('|'); },
  fetch(text, gender) {
    const key = this.sig() + '|' + (settings.voiceAuto ? gender : '') + '|' + text;
    if (!this.cache.has(key)) {
      const p = api.speak(text, gender).then((bufs) => bufs.map(toArrayBuffer));
      this.cache.set(key, p);
      p.catch(() => this.cache.delete(key));
      if (this.cache.size > 400) this.cache.delete(this.cache.keys().next().value);
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
          const off = () => { this.audio.onended = this.audio.onpause = this.audio.onerror = null; };
          this.audio.onended = this.audio.onpause = () => { off(); resolve(); };
          this.audio.onerror = () => { off(); reject(new Error('Could not play audio')); };
          // stopping while play() is starting is not an error
          this.audio.play().catch((e) => { off(); token !== this.token || e.name === 'AbortError' ? resolve() : reject(e); });
        });
      } finally {
        URL.revokeObjectURL(url);
      }
    }
    return token === this.token;
  },
  /** Speak one line. Resolves true when finished, false when interrupted. */
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
  stop() { this.token++; this.audio.pause(); },
};

// ================================================================ EPISODES
const E = {
  project: null,
  samples: null, // 16 kHz audio of the open episode (memory only)
  job: null,
  els: new Map(),
  busy: new Set(), // line ids being translated right now
  currentId: null,
  speakingAll: false,
  stopAt: null,
};

// ---------- saving ----------
let dirty = false;
const flushSave = debounce(async () => {
  const p = E.project;
  if (!p || !dirty) return;
  dirty = false;
  p.updatedAt = Date.now();
  try {
    await api.saveProject(p);
    refreshProjects();
  } catch (e) {
    toast('Could not save: ' + errMsg(e), 'error');
  }
}, 700);
function saveProject() { dirty = true; flushSave(); }
function saveNowIfDirty() {
  if (dirty && E.project) {
    dirty = false;
    flushSave.cancel();
    E.project.updatedAt = Date.now();
    return api.saveProject(E.project).catch(() => {});
  }
  return Promise.resolve();
}
window.addEventListener('beforeunload', () => {
  if (dirty && E.project) { E.project.updatedAt = Date.now(); api.saveProjectNow(E.project); }
});

// ---------- saved work list ----------
async function refreshProjects() {
  const list = await api.listProjects();
  const ul = $('#projects');
  ul.innerHTML = '';
  if (!list.length) {
    ul.innerHTML = `<li class="empty-li">${t('Episodes you open are saved here automatically.')}</li>`;
    return;
  }
  for (const p of list) {
    const li = document.createElement('li');
    li.className = E.project && E.project.id === p.id ? 'active' : '';
    const working = E.job && E.project && E.project.id === p.id;
    const chip = working ? `<span class="chip">${t('Working…')}</span>`
      : p.failed || p.pending ? `<span class="chip">${t(p.failed ? 'Needs retry' : 'Unfinished')}</span>`
      : p.lines ? `<span class="chip ok">${t('Ready')}</span>` : '';
    li.innerHTML = `<div class="pbody"><div class="pname"></div><div class="pmeta">${chip}<span>${I18N.tn(p.lines, '{n} lines')} · ${new Date(p.updatedAt).toLocaleDateString()}</span></div></div>`;
    $('.pname', li).textContent = p.name;
    li.title = p.name;
    li.onclick = () => openProject(p.id);
    ul.appendChild(li);
  }
}

// ---------- open / close ----------
const VIDEO_EXT = /\.(mp4|mkv|mov|m4v|webm|avi|ts)$/i;

function setMedia(file) {
  const player = $('#player');
  player.onerror = () => {
    if (VIDEO_EXT.test(file.name)) toast('This video format cannot be shown here, but its sound is still translated.', { ms: 7000 });
  };
  player.src = file.url; // streamed from disk
  player.classList.toggle('audio-only', !VIDEO_EXT.test(file.name));
  player.classList.remove('hidden');
  $('#media-missing').classList.add('hidden');
}
function clearMedia(missing) {
  const player = $('#player');
  player.onerror = null;
  player.removeAttribute('src');
  player.load();
  player.classList.add('hidden');
  $('#media-missing').classList.toggle('hidden', !missing);
}

/** The episode's audio as 16 kHz mono Float32 samples. */
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

function needKeys() {
  if (settings.sarvamKeySet) return false;
  showWelcome();
  return true;
}

async function startEpisode(file) {
  if (!file || needKeys()) return;
  if (E.job && !confirm('An episode is still being translated. Pause it and open this one?')) return;
  await saveNowIfDirty();
  cancelJob();
  stopSpeakAll();
  const project = {
    id: newId(), name: file.name.replace(/\.[^.]+$/, ''), mediaName: file.name, mediaPath: file.path,
    createdAt: Date.now(), updatedAt: Date.now(), duration: 0, lines: [],
  };
  showProject(project);
  setMedia(file);
  api.saveProject(project).then(refreshProjects).catch(() => {}); // appears in Saved work right away
  const job = beginJob();
  setProgress({ phase: 'listen', frac: 0.01, text: 'Reading the sound from the file…' });
  let samples;
  try {
    samples = await decodeEpisodeAudio(file);
  } catch (e) {
    endJob(job);
    toast('Could not read the sound in this file. Try an .mp4, .mp3 or .wav version. (' + errMsg(e) + ')', { kind: 'error', ms: 10000 });
    return;
  }
  if (job.cancelled) return;
  E.samples = samples;
  project.duration = samples.length / AudioKit.SR;
  updateMeta();
  saveProject();
  await runPipeline(project, samples, job);
}

async function openProject(id) {
  if (E.project && E.project.id === id) return;
  if (E.job && !confirm('An episode is still being translated. Pause it and open another one?')) return;
  await saveNowIfDirty();
  cancelJob();
  stopSpeakAll();
  const p = await api.loadProject(id);
  if (!p) return toast('Could not open that episode.', 'error');
  E.samples = null;
  showProject(p);
  const file = p.mediaPath ? await api.relinkMedia(p.mediaPath) : null;
  if (file) {
    setMedia(file);
    decodeEpisodeAudio(file).then((s) => { if (E.project === p) E.samples = s; }).catch(() => {});
  } else clearMedia(p.mediaName !== 'Live capture');
}

function showProject(project) {
  E.project = project;
  E.currentId = null;
  E.busy.clear();
  $('#episode-empty').classList.add('hidden');
  $('#episode').classList.remove('hidden');
  $('#ep-name').value = project.name;
  $('#search').value = '';
  renderAllLines();
  updateMeta();
  refreshProjects();
}

function closeEpisode() {
  cancelJob();
  stopSpeakAll();
  E.project = null;
  E.samples = null;
  clearMedia(false);
  $('#episode').classList.add('hidden');
  $('#episode-empty').classList.remove('hidden');
  refreshProjects();
}

async function locateMedia() {
  const file = await api.openMedia();
  if (!file || !E.project) return;
  E.project.mediaPath = file.path;
  E.project.mediaName = file.name;
  saveProject();
  setMedia(file);
  updateMeta();
  decodeEpisodeAudio(file).then((s) => (E.samples = s)).catch(() => {});
}

$('#btn-open').onclick = async () => { if (!needKeys()) startEpisode(await api.openMedia()); };
$('#btn-open-2').onclick = $('#btn-open').onclick;
$('#btn-relink').onclick = locateMedia;
$('#btn-relink-menu').onclick = locateMedia;
$('#ep-name').addEventListener('input', (e) => {
  if (!E.project) return;
  E.project.name = e.target.value.trim() || 'Untitled episode';
  saveProject();
});
$('#ep-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') e.target.blur(); });
$('#btn-delete-ep').onclick = async () => {
  if (!E.project || !confirm(`Delete "${E.project.name}"? This cannot be undone.`)) return;
  const id = E.project.id;
  dirty = false;
  flushSave.cancel();
  closeEpisode();
  await api.deleteProject(id);
  refreshProjects();
};

// drag & drop a file anywhere on the Episodes screen
(() => {
  let depth = 0;
  const ws = $('#workspace');
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());
  ws.addEventListener('dragenter', (e) => { if (e.dataTransfer.types.includes('Files')) { depth++; ws.classList.add('dragging'); } });
  ws.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; ws.classList.remove('dragging'); } });
  ws.addEventListener('drop', async (e) => {
    depth = 0;
    ws.classList.remove('dragging');
    const f = e.dataTransfer.files[0];
    if (!f) return;
    const file = await api.openPath(api.pathForFile(f));
    if (!file) return toast('That file is not an audio or video file.', 'error');
    startEpisode(file);
  });
})();

function updateMeta() {
  const p = E.project;
  if (!p) return;
  const done = p.lines.filter((l) => l.kn).length;
  $('#ep-meta').textContent = [p.mediaName, p.duration ? fmtTime(p.duration) : '', p.lines.length ? t('{done} of {n} lines in Kannada', { done, n: p.lines.length }) : '']
    .filter(Boolean).join('  ·  ');
  updateBanner();
}

// ---------- jobs & progress ----------
function beginJob() {
  const job = { cancelled: false };
  E.job = job;
  refreshProjects();
  return job;
}
function endJob(job) {
  if (E.job !== job) return;
  E.job = null;
  $('#progress').classList.add('hidden');
  updateBanner();
  refreshProjects();
}
function cancelJob() {
  if (E.job) {
    E.job.cancelled = true;
    (E.job.pokes || []).forEach((f) => f()); // let waiting loops finish
  }
  E.job = null;
  E.busy.clear();
  $('#progress').classList.add('hidden');
  updateBanner();
}
$('#btn-cancel').onclick = () => {
  cancelJob();
  // lines that were waiting go back to "not yet translated"
  if (E.project) E.project.lines.forEach((l) => updateLineEl(l));
  refreshProjects();
  toast('Paused. Everything done so far is saved.');
};

function setProgress({ phase, frac, text }) {
  $('#progress').classList.remove('hidden');
  $('#progress-fill').style.width = Math.round(Math.min(1, Math.max(0, frac)) * 100) + '%';
  $('#progress-text').textContent = text;
  const order = ['listen', 'write', 'ready'];
  const at = order.indexOf(phase);
  order.forEach((ph, i) => {
    const el = $('#step-' + ph);
    el.classList.toggle('on', i === at);
    el.classList.toggle('done', i < at);
  });
}

function updateBanner() {
  const p = E.project;
  const b = $('#banner');
  if (!p || E.job) return b.classList.add('hidden');
  const failed = p.lines.filter((l) => l.error).length;
  const pending = p.lines.filter((l) => l.kn == null && l.ta).length;
  if (!failed && !pending) return b.classList.add('hidden');
  b.classList.remove('hidden');
  if (failed) {
    $('#banner-text').textContent = I18N.tn(failed, '{n} parts of the episode could not be heard.');
    $('#banner-btn').textContent = t('Try again');
    $('#banner-btn').onclick = retryFailed;
  } else {
    $('#banner-text').textContent = I18N.tn(pending, '{n} lines not yet written in Kannada.');
    $('#banner-btn').textContent = t('Continue');
    $('#banner-btn').onclick = () => translateLines(p.lines.filter((l) => l.kn == null && l.ta));
  }
}

// ---------- the pipeline: hear (Sarvam) → write Kannada (Claude) ----------
const FIRST_BATCH = 10; // small first batch so Kannada shows up quickly
const BATCH = 30;
const STT_WORKERS = 4;
const TRANSLATE_WORKERS = 2;

async function runPipeline(project, samples, job) {
  const sr = AudioKit.SR;
  const chunks = AudioKit.segmentBySilence(samples, sr).map((c, i) => ({ ...c, i, s0: c.start / sr, s1: c.end / sr }));
  const results = new Array(chunks.length);
  const st = { next: 0, heard: 0, sttDone: false, fatal: null, failed: 0, lineNo: project.lines.length };

  const report = () => {
    if (job.cancelled) return;
    const tot = project.lines.filter((l) => l.ta).length;
    const ready = project.lines.filter((l) => l.kn != null && l.ta).length;
    if (!st.sttDone) {
      setProgress({ phase: 'listen', frac: 0.6 * (st.heard / chunks.length) + 0.4 * (tot ? ready / tot : 0) * (st.heard / chunks.length),
        text: `Heard ${st.heard} of ${chunks.length} parts · ${ready} lines in Kannada` });
    } else {
      setProgress({ phase: 'write', frac: 0.6 + 0.4 * (tot ? ready / tot : 1), text: `${ready} of ${tot} lines in Kannada` });
    }
  };
  report();

  const translator = startTranslator(project, job, () => st.sttDone, report);

  // hand lines to the page in episode order
  const emit = () => {
    while (st.next < chunks.length && results[st.next] !== undefined) {
      const c = chunks[st.next];
      for (const seg of results[st.next]) {
        const line = { id: 'L' + ++st.lineNo, start: seg.start, end: seg.end, ta: seg.ta, kn: seg.ta ? null : '', gender: 'unknown', note: '', chunk: [c.s0, c.s1] };
        if (seg.error) line.error = seg.error;
        project.lines.push(line);
        addLineEl(line);
      }
      st.next++;
    }
    updateMeta();
    saveProject();
    translator.poke();
  };

  const hear = async (c) => {
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
    while (queue.length && !job.cancelled && !st.fatal) {
      const c = queue.shift();
      try {
        results[c.i] = await hear(c);
      } catch (e) {
        const m = errMsg(e);
        if (/key|401|403/i.test(m)) st.fatal = m;
        st.failed++;
        results[c.i] = [{ ta: '', start: c.s0, end: c.s1, error: m }];
      }
      st.heard++;
      if (!job.cancelled) { emit(); report(); }
    }
  };
  await Promise.all(Array.from({ length: STT_WORKERS }, worker));
  if (st.fatal) {
    // the rest of the episode could not be heard: keep it as retry-able parts
    for (const c of queue) results[c.i] = [{ ta: '', start: c.s0, end: c.s1, error: st.fatal }];
    if (!job.cancelled) emit();
  }
  st.sttDone = true;
  translator.poke();
  const tErr = await translator.done;
  if (job.cancelled) return;

  endJob(job);
  saveProject();
  if (st.fatal) toast(st.fatal, { kind: 'error', ms: 10000, action: 'Open settings', onAction: () => showTab('settings') });
  else if (tErr) toast('Translation paused: ' + tErr, { kind: 'error', ms: 10000, action: 'Continue', onAction: () => $('#banner-btn').click() });
  else if (st.failed) { /* the banner above the video explains it and offers "Try again" */ }
  else toast('Done. The whole episode is in Kannada.', { action: 'Listen', onAction: () => $('#btn-speak-all').click() });
}

/**
 * Translates waiting lines in batches, up to TRANSLATE_WORKERS at a time.
 * Stops at the first error (lines stay "not yet in Kannada" and can be continued).
 */
function startTranslator(project, job, inputDone, onProgress) {
  let wake = null;
  let first = true;
  let error = null;
  const inflight = new Set();
  const poke = () => { if (wake) { const w = wake; wake = null; w(); } };
  if (job) job.pokes = (job.pokes || []).concat(poke);
  const done = (async () => {
    for (;;) {
      if (job.cancelled) return null;
      const waiting = project.lines.filter((l) => l.kn == null && l.ta && !E.busy.has(l.id));
      const size = first ? FIRST_BATCH : BATCH;
      if (!error && inflight.size < TRANSLATE_WORKERS && waiting.length && (waiting.length >= size || inputDone())) {
        first = false;
        const batch = waiting.slice(0, size);
        const p = translateBatch(project, batch, job)
          .catch((e) => { error = error || errMsg(e); })
          .finally(() => { inflight.delete(p); onProgress(); poke(); });
        inflight.add(p);
        continue;
      }
      if ((error || (inputDone() && !waiting.length)) && !inflight.size) return error;
      await new Promise((r) => (wake = r));
    }
  })();
  return { poke, done };
}

async function translateBatch(project, batch, job) {
  batch.forEach((l) => { E.busy.add(l.id); updateLineEl(l); });
  try {
    const firstIdx = project.lines.indexOf(batch[0]);
    const context = project.lines.slice(Math.max(0, firstIdx - 15), firstIdx).filter((l) => l.ta).map((l) => ({ ta: l.ta, kn: l.kn || '', gender: l.gender }));
    const res = await api.translate(batch.map((l) => ({ id: l.id, ta: l.ta })), context, false);
    if ((job && job.cancelled) || E.project !== project) return;
    if (res.warning) toast(res.warning, { kind: 'error', ms: 7000 });
    const byId = new Map(res.lines.map((r) => [r.id, r]));
    for (const l of batch) {
      const r = byId.get(l.id);
      if (!r) continue;
      // Claude's corrected Tamil replaces what was misheard (the writer's own edits win).
      if (r.ta && !l.taEdited) { if (l.taHeard == null) l.taHeard = l.ta; l.ta = r.ta; }
      Object.assign(l, { kn: r.kn, gender: r.gender || 'unknown', note: r.note || '', edited: false });
    }
    updateMeta();
    saveProject();
  } finally {
    batch.forEach((l) => { E.busy.delete(l.id); updateLineEl(l); });
  }
}

/** Translate a given set of lines (Continue, re-translate all). */
async function translateLines(lines) {
  const p = E.project;
  if (!p || E.job || !lines.length) return;
  const job = beginJob();
  updateBanner();
  const ids = new Set(lines.map((l) => l.id));
  lines.forEach((l) => { l.kn = null; updateLineEl(l); });
  const report = () => {
    const ready = p.lines.filter((l) => ids.has(l.id) && l.kn != null).length;
    setProgress({ phase: 'write', frac: ready / ids.size, text: `${ready} of ${ids.size} lines in Kannada` });
  };
  report();
  const tErr = await startTranslator(p, job, () => true, report).done;
  if (job.cancelled) return;
  endJob(job);
  if (tErr) toast('Translation paused: ' + tErr, { kind: 'error', ms: 10000 });
  else toast('Kannada updated.');
}

async function retryFailed() {
  const p = E.project;
  if (!p || E.job) return;
  if (!E.samples) {
    toast('The episode file is needed to listen again.', { action: 'Locate file', onAction: locateMedia });
    return;
  }
  const failed = p.lines.filter((l) => l.error);
  const job = beginJob();
  let n = 0;
  for (const l of failed) {
    if (job.cancelled) return;
    setProgress({ phase: 'listen', frac: n++ / failed.length, text: `Listening again: ${n} of ${failed.length}` });
    await reHear(l);
  }
  endJob(job);
  const waiting = p.lines.filter((l) => l.kn == null && l.ta);
  if (waiting.length) translateLines(waiting);
}

/** Listen to a failed part again; it may come back as several lines. */
async function reHear(line) {
  const p = E.project;
  const [s0, s1] = line.chunk;
  const sr = AudioKit.SR;
  try {
    const wav = AudioKit.encodeWav(AudioKit.normalize(E.samples.subarray(Math.floor(s0 * sr), Math.floor(s1 * sr))), sr);
    const r = await api.transcribe(wav, true);
    const segs = r.segments && r.segments.length
      ? r.segments.map((s) => ({ ta: s.text, start: s0 + s.start, end: s0 + Math.max(s.end, s.start + 0.5) }))
      : r.transcript ? splitTimed(r.transcript, s0, s1) : [];
    const idx = p.lines.indexOf(line);
    const repl = segs.map((s, i) => ({ id: line.id + (i ? '-' + i : ''), start: s.start, end: s.end, ta: s.ta, kn: null, gender: 'unknown', note: '', chunk: line.chunk }));
    p.lines.splice(idx, 1, ...repl);
    renderAllLines();
    saveProject();
    return true;
  } catch (e) {
    line.error = errMsg(e);
    updateLineEl(line);
    return false;
  }
}

// ---------- the list of lines ----------
function renderAllLines() {
  const box = $('#lines');
  box.innerHTML = `<div class="lines-head"><div>${t('Time')}</div><div>${t('Tamil (as heard)')}</div><div>${t('Kannada')}</div><div></div></div>`;
  E.els.clear();
  const frag = document.createDocumentFragment();
  for (const l of E.project.lines) frag.appendChild(makeLineEl(l));
  box.appendChild(frag);
  applySearch();
  updateMeta();
}
function addLineEl(line) {
  $('#lines').appendChild(makeLineEl(line));
  applySearch(line);
}

function makeLineEl(line) {
  const el = document.createElement('div');
  el.className = 'line';
  el.dataset.id = line.id;
  el.innerHTML = `
    <button class="time" title="Play the original Tamil"></button>
    <div class="ta" spellcheck="false" title="Click to correct the Tamil, then ↻ to write the Kannada again"></div>
    <div class="knwrap"><div class="kn" contenteditable="true" spellcheck="false"></div><div class="sub"></div></div>
    <div class="acts">
      <button class="act" data-act="orig" title="Play original Tamil">▶</button>
      <button class="act" data-act="speak" title="Listen in Kannada (K)">🔊</button>
      <button class="act" data-act="redo" title="Write this line again">↻</button>
    </div>`;
  E.els.set(line.id, el);
  const ta = $('.ta', el);
  ta.addEventListener('focus', () => selectLine(line, false));
  ta.addEventListener('input', () => {
    if (line.taHeard == null) line.taHeard = line.ta;
    line.ta = ta.innerText.replace(/\s*\n\s*/g, ' ').trim();
    line.taEdited = true;
    updateSub(line, el);
    saveProject();
  });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ta.blur(); redoLine(line); }
    if (e.key === 'Escape') ta.blur();
  });
  ta.addEventListener('paste', (e) => {
    e.preventDefault();
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
  });
  const kn = $('.kn', el);
  kn.addEventListener('focus', () => selectLine(line, false));
  kn.addEventListener('input', () => {
    line.kn = kn.innerText.replace(/\s*\n\s*/g, ' ').trim();
    line.edited = true;
    updateSub(line, el);
    saveProject();
  });
  kn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); kn.blur(); }
    if (e.key === 'Escape') kn.blur();
  });
  // paste as plain text only
  kn.addEventListener('paste', (e) => {
    e.preventDefault();
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
  });
  el.addEventListener('click', (e) => { if (!e.target.closest('.kn, .ta, .act')) selectLine(line, true); });
  $('.time', el).onclick = (e) => { e.stopPropagation(); selectLine(line, false); playOriginal(line); };
  $('[data-act=orig]', el).onclick = () => playOriginal(line);
  $('[data-act=speak]', el).onclick = () => speakLine(line);
  $('[data-act=redo]', el).onclick = () => redoLine(line);
  updateLineEl(line, el);
  return el;
}

function updateLineEl(line, el = E.els.get(line.id)) {
  if (!el) return;
  const busy = E.busy.has(line.id);
  el.classList.toggle('failed', !!line.error);
  $('.time', el).textContent = fmtTime(line.start);
  const ta = $('.ta', el);
  if (document.activeElement !== ta) ta.textContent = line.error ? t('Could not hear this part.') : line.ta;
  ta.contentEditable = line.error ? 'false' : 'true';
  if (line.error) ta.title = line.error;
  const kn = $('.kn', el);
  if (document.activeElement !== kn) kn.textContent = line.kn || '';
  kn.contentEditable = line.error ? 'false' : 'true';
  kn.classList.toggle('wait', busy);
  kn.dataset.placeholder = t(line.error ? 'Click ↻ to listen again' : busy ? 'Writing Kannada…' : line.kn == null ? 'Not yet in Kannada' : line.ta ? '(nothing to translate)' : '');
  $('[data-act=speak]', el).disabled = !line.kn;
  $('[data-act=redo]', el).disabled = busy;
  updateSub(line, el);
}

function updateSub(line, el) {
  const bits = [];
  if (line.kn && line.gender === 'male') bits.push(`<span class="who m">${t('♂ man')}</span>`);
  if (line.kn && line.gender === 'female') bits.push(`<span class="who f">${t('♀ woman')}</span>`);
  if (line.taEdited) bits.push(`<span class="edited-tag">${t('✎ Tamil edited')}</span>`);
  else if (line.taHeard != null && line.taHeard !== line.ta) bits.push(`<span class="fixed-tag" title="${t('Heard as: ')}${escapeHtml(line.taHeard)}">${t('✓ Tamil corrected')}</span>`);
  if (line.edited) bits.push(`<span class="edited-tag">${t('✎ edited')}</span>`);
  if (line.note) bits.push(`<span class="note">${escapeHtml(line.note)}</span>`);
  $('.sub', el).innerHTML = bits.join('');
}

function selectLine(line, seek) {
  if (!line) return;
  E.currentId = line.id;
  $$('.line.current').forEach((x) => x.classList.remove('current'));
  const el = E.els.get(line.id);
  if (el) el.classList.add('current');
  const player = $('#player');
  if (seek && player.src && player.paused) player.currentTime = Math.max(0, line.start - 0.1);
}

function scrollToLine(line) {
  const el = line && E.els.get(line.id);
  if (!el) return;
  const box = $('#lines');
  const r = el.getBoundingClientRect(), b = box.getBoundingClientRect();
  if (r.top < b.top + 40 || r.bottom > b.bottom - 20) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function playOriginal(line) {
  const player = $('#player');
  if (!player.src) return toast('Link the episode file to hear the original Tamil.', { action: 'Locate file', onAction: locateMedia });
  stopSpeakAll();
  player.currentTime = Math.max(0, line.start - 0.15);
  E.stopAt = line.end + 0.3;
  E.stopFrom = line.start - 1;
  player.play().catch(() => {});
}

async function speakLine(line) {
  if (!line.kn) return;
  $('#player').pause();
  stopSpeakAll();
  selectLine(line, false);
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
  const el = line && E.els.get(line.id);
  if (el) el.classList.add('speaking');
}

async function redoLine(line) {
  if (E.busy.has(line.id)) return;
  if (line.error) {
    if (!E.samples) return toast('The episode file is needed to listen again.', { action: 'Locate file', onAction: locateMedia });
    const el = E.els.get(line.id);
    $('.kn', el).dataset.placeholder = t('Listening again…');
    if (!(await reHear(line))) return toast('Still could not hear it: ' + line.error, 'error');
    const fresh = E.project.lines.filter((l) => l.chunk === line.chunk && l.kn == null && l.ta);
    if (!fresh.length) return;
    try { await translateBatch(E.project, fresh, null); } catch (e) { toast(errMsg(e), 'error'); }
    return;
  }
  if (!line.ta) return;
  const before = { kn: line.kn, gender: line.gender, note: line.note, edited: line.edited };
  line.kn = null;
  try {
    await translateBatch(E.project, [line], null);
  } catch (e) {
    Object.assign(line, before);
    updateLineEl(line);
    toast('Could not write this line: ' + errMsg(e), 'error');
  }
}

$('#btn-retranslate-all').onclick = () => {
  const p = E.project;
  if (!p) return;
  if (E.job) return toast('Wait for the current work to finish.');
  const lines = p.lines.filter((l) => l.ta && !l.edited && !l.error);
  if (!lines.length) return;
  const kept = p.lines.filter((l) => l.edited).length;
  if (!confirm(`Write ${plural(lines.length, 'line')} again with the current style, names and notes?${kept ? `\n\n${plural(kept, 'line')} you edited will be kept.` : ''}`)) return;
  translateLines(lines);
};

// ---------- player follow ----------
function lineAt(t) {
  const L = E.project ? E.project.lines : [];
  let lo = 0, hi = L.length - 1, idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (L[mid].start <= t) { idx = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return idx >= 0 ? L[idx] : null;
}
$('#player').addEventListener('timeupdate', () => {
  const player = $('#player');
  const t = player.currentTime;
  if (E.stopAt != null) {
    if (t < E.stopFrom || t > E.stopAt + 1.5) E.stopAt = null; // the user jumped elsewhere
    else if (t >= E.stopAt) { E.stopAt = null; player.pause(); }
  }
  if (player.paused) return;
  const cur = lineAt(t);
  if (cur && cur.id !== E.currentId && !document.activeElement.closest?.('.kn')) {
    selectLine(cur, false);
    if ($('#follow').checked) scrollToLine(cur);
  }
});
$('#player').addEventListener('play', () => { if (E.speakingAll) stopSpeakAll(); });

// ---------- listen to everything ----------
$('#btn-speak-all').onclick = async () => {
  const p = E.project;
  if (!p) return;
  const lines = p.lines.filter((l) => l.kn);
  if (!lines.length) return toast('No Kannada lines yet.');
  const cur = p.lines.findIndex((l) => l.id === E.currentId);
  let start = cur < 0 ? 0 : lines.findIndex((l) => p.lines.indexOf(l) >= cur);
  if (start < 0) start = 0;
  $('#player').pause();
  Speaker.stop();
  E.speakingAll = true;
  $('#btn-stop-speak').classList.remove('hidden');
  $('#btn-speak-all').classList.add('hidden');
  try {
    for (let i = start; i < lines.length && E.speakingAll; i++) {
      for (const n of lines.slice(i + 1, i + 3)) Speaker.fetch(n.kn, n.gender).catch(() => {}); // prefetch
      selectLine(lines[i], false);
      markSpeaking(lines[i]);
      if ($('#follow').checked) scrollToLine(lines[i]);
      if (!(await Speaker.say(lines[i].kn, lines[i].gender))) break;
    }
  } catch (e) {
    toast('Voice failed: ' + errMsg(e), 'error');
  }
  stopSpeakAll();
};
function stopSpeakAll() {
  if (!E.speakingAll) return;
  E.speakingAll = false;
  Speaker.stop();
  markSpeaking(null);
  $('#btn-stop-speak').classList.add('hidden');
  $('#btn-speak-all').classList.remove('hidden');
}
$('#btn-stop-speak').onclick = stopSpeakAll;

// ---------- search ----------
$('#search').addEventListener('input', debounce(() => applySearch(), 120));
function applySearch(only) {
  if (!E.project) return;
  const q = $('#search').value.trim().toLowerCase();
  const test = (l) => !q || `${l.ta} ${l.kn || ''}`.toLowerCase().includes(q);
  if (only) {
    const el = E.els.get(only.id);
    if (el) el.classList.toggle('hidden', !test(only));
  } else {
    for (const l of E.project.lines) {
      const el = E.els.get(l.id);
      if (el) el.classList.toggle('hidden', !test(l));
    }
  }
  const n = q ? E.project.lines.filter(test).length : 0;
  $('#search-count').textContent = q ? `${n} found` : '';
}

// ---------- text size ----------
let knSize = store.get('knSize', 18);
const applyKnSize = () => document.documentElement.style.setProperty('--kn-size', knSize + 'px');
applyKnSize();
$('#kn-smaller').onclick = () => { knSize = Math.max(14, knSize - 1); applyKnSize(); store.set('knSize', knSize); };
$('#kn-bigger').onclick = () => { knSize = Math.min(28, knSize + 1); applyKnSize(); store.set('knSize', knSize); };
$('#follow').checked = store.get('follow', true);
$('#follow').onchange = () => store.set('follow', $('#follow').checked);

// ---------- export ----------
bindMenu('#btn-export', '#export-menu');
bindMenu('#btn-more', '#more-menu');
$$('#export-menu button').forEach((b) => (b.onclick = () => exportAs(b.dataset.export)));

async function exportAs(kind) {
  const p = E.project;
  if (!p) return;
  const lines = p.lines.filter((l) => l.kn);
  if (!lines.length) return toast('Nothing in Kannada yet.');
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
      const who = (g) => (g === 'male' ? 'Man' : g === 'female' ? 'Woman' : '');
      const csv = '﻿' + ['Time,Tamil,Kannada,Speaker,Note', ...p.lines.filter((l) => l.ta).map((l) => [fmtTime(l.start), l.ta, l.kn || '', who(l.gender), l.note || ''].map(q).join(','))].join('\r\n');
      saved = await api.saveFile({ defaultName: base + ' - Tamil-Kannada.csv', filters: [{ name: 'CSV', extensions: ['csv'] }], data: csv });
    } else if (kind === 'doc') {
      const rows = p.lines.filter((l) => l.ta).map((l) => `<tr><td class="t">${fmtTime(l.start)}</td><td class="ta">${escapeHtml(l.ta)}</td><td class="kn">${escapeHtml(l.kn || '')}${l.note ? `<div class="n">${escapeHtml(l.note)}</div>` : ''}</td></tr>`).join('');
      const html = `<html><head><meta charset="utf-8"><title>${escapeHtml(p.name)}</title><style>body{font-family:'Nirmala UI','Noto Sans Kannada',sans-serif}table{border-collapse:collapse;width:100%}th{text-align:left;border-bottom:2px solid #333;padding:6px 8px}td{vertical-align:top;padding:6px 8px;border-bottom:1px solid #ddd}.t{color:#888;font-size:9pt;white-space:nowrap}.kn{font-size:14pt}.ta{color:#555;font-size:10pt}.n{color:#a66b00;font-size:9pt}</style></head><body><h1>${escapeHtml(p.name)}</h1><table><tr><th>Time</th><th>Tamil</th><th>Kannada</th></tr>${rows}</table></body></html>`;
      saved = await api.saveFile({ defaultName: base + ' - script.doc', filters: [{ name: 'Word document', extensions: ['doc'] }], data: html });
    } else if (kind === 'wav' || kind === 'dub') {
      saved = await exportVoice(p, lines, kind === 'dub', base);
    }
  } catch (e) {
    if (E.job && E.job.export) endJob(E.job);
    return toast('Export failed: ' + errMsg(e), 'error');
  }
  if (saved) toast('Saved ' + saved.split(/[\\/]/).pop(), { action: 'Show', onAction: () => api.reveal(saved) });
}

async function exportVoice(p, lines, timed, base) {
  if (E.job) { toast('Wait for the current work to finish.'); return null; }
  const job = beginJob();
  job.export = true;
  const all = [];
  for (let i = 0; i < lines.length; i++) {
    if (job.cancelled) return null;
    setProgress({ phase: 'write', frac: i / lines.length, text: `Recording Kannada voice: ${i} of ${lines.length}` });
    // keep a few requests in flight for speed
    for (const n of lines.slice(i + 1, i + 4)) Speaker.fetch(n.kn, n.gender).catch(() => {});
    all.push({ line: lines[i], bufs: await Speaker.fetch(lines[i].kn, lines[i].gender) });
  }
  setProgress({ phase: 'ready', frac: 1, text: 'Putting the audio together…' });
  const RATE = 24000;
  const ctx = new AudioContext({ sampleRate: RATE });
  let out;
  try {
    const decoded = [];
    for (const { line, bufs } of all) {
      const parts = [];
      for (const b of bufs) parts.push((await ctx.decodeAudioData(b.slice(0))).getChannelData(0));
      const merged = new Float32Array(parts.reduce((n, x) => n + x.length, 0));
      let o = 0;
      for (const x of parts) { merged.set(x, o); o += x.length; }
      decoded.push({ line, data: merged });
    }
    const gap = Math.round(0.35 * RATE);
    const placed = [];
    let cursor = 0, total = 0;
    for (const d of decoded) {
      // timed: start each line where it was said in the episode (never overlapping)
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
    endJob(job);
  }
  return api.saveFile({
    defaultName: base + (timed ? ' - Kannada dub track.wav' : ' - Kannada voice.wav'),
    filters: [{ name: 'WAV audio', extensions: ['wav'] }],
    data: new Uint8Array(AudioKit.encodeWav(out, RATE)),
    encoding: 'binary',
  });
}

// ================================================================ LIVE
const Live = {
  source: 'system', running: false, stream: null, ctx: null, seg: null,
  lines: [], t0: 0, offset: 0, n: 0, paused: false,
  translateChain: Promise.resolve(), speakQueue: [], speaking: false,
};
const LIVE_HINT = {
  system: 'Play the Tamil episode on this laptop (YouTube, Hotstar, Sun NXT, VLC…) and press Start. Kannada appears a few seconds after each line.',
  mic: 'Hold the microphone near the speaker or TV and press Start.',
};
const liveEmpty = () => `<div class="live-empty"><div><b>${t('Kannada will appear here')}</b>${t('as each Tamil line is spoken.')}</div></div>`;

function setLiveSource(src) {
  if (Live.running) return toast('Stop listening first to change the source.');
  Live.source = src;
  $$('#live-source button').forEach((x) => { x.classList.toggle('on', x.dataset.src === src); x.setAttribute('aria-checked', x.dataset.src === src); });
  $('#mic-select').classList.toggle('hidden', src !== 'mic');
  $('#live-hint').textContent = t(LIVE_HINT[src]) + ($('#live-speak').checked ? t(' While Kannada is spoken aloud, listening pauses, so headphones work best.') : '');
  if (src === 'mic') listMics();
}
$$('#live-source button').forEach((b) => b.addEventListener('click', () => setLiveSource(b.dataset.src)));
$('#live-speak').addEventListener('change', () => { store.set('liveSpeak', $('#live-speak').checked); setLiveSource(Live.source); });

async function listMics() {
  try {
    await api.ensureMic();
    let mics = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
    if (mics.length && !mics[0].label) {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
      mics = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
    }
    const sel = $('#mic-select');
    const prev = sel.value || store.get('mic', '');
    sel.innerHTML = mics.map((m) => `<option value="${escapeHtml(m.deviceId)}">${escapeHtml(m.label || 'Microphone')}</option>`).join('') || '<option value="">No microphone found</option>';
    if (mics.some((m) => m.deviceId === prev)) sel.value = prev;
  } catch {
    toast('Microphone access is blocked. Allow it in your system privacy settings.', { kind: 'error', ms: 8000 });
  }
}
$('#mic-select').onchange = () => store.set('mic', $('#mic-select').value);

function setLiveState(text, mode) {
  $('#live-state').textContent = text;
  $('#live-status').className = 'live-status ' + (mode || '');
}
function updateLiveCount() {
  const n = Live.lines.filter((l) => l.kn).length;
  $('#live-count').textContent = n ? I18N.tn(n, '{n} lines this session') : '';
}

$('#btn-live').onclick = () => (Live.running ? stopLive() : startLive());

async function startLive() {
  if (needKeys()) return;
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
    if (Live.source === 'system') {
      toast('This computer did not allow capturing its own sound. On a Mac: System Settings → Privacy & Security → Screen & System Audio Recording → allow Anuvaada, then restart it. Or use the Microphone.', { kind: 'error', ms: 14000, action: 'Use microphone', onAction: () => setLiveSource('mic') });
    } else toast('Could not open the microphone: ' + errMsg(e), { kind: 'error', ms: 8000 });
    return;
  }
  try {
    const ctx = new AudioContext({ sampleRate: AudioKit.SR });
    await ctx.audioWorklet.addModule('capture-worklet.js');
    const src = ctx.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(ctx, 'capture-processor');
    // Cut the bass rumble and background-music low end, which confuse speech recognition.
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 90;
    src.connect(hp);
    hp.connect(node);
    node.connect(ctx.destination); // outputs silence; keeps the worklet running
    Live.seg = new AudioKit.LiveSegmenter(onLiveChunk);
    node.port.onmessage = (e) => {
      if (Live.paused || !Live.seg) return; // also ignores samples that arrive just after Stop
      Live.seg.push(e.data);
      $('#meter').style.width = Math.max(0, Math.min(100, (Live.seg.level + 60) * 1.8)) + '%';
    };
    stream.getAudioTracks()[0].addEventListener('ended', () => Live.running && stopLive());
    // continue the clock after a previous Stop instead of restarting at 0:00
    Object.assign(Live, { running: true, stream, ctx, t0: performance.now(), offset: Live.lines.length ? Live.lines[Live.lines.length - 1].end + 1 : 0 });
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop());
    return toast('Could not start listening: ' + errMsg(e), 'error');
  }
  if (!Live.lines.length) $('#live-feed').innerHTML = '';
  $('#btn-live').textContent = t('■ Stop');
  $('#btn-live').classList.replace('primary', 'danger');
  setLiveState(t('Listening'), 'on');
}

function stopLive() {
  const seg = Live.seg;
  Live.seg = null;
  if (seg) seg.flush();
  Live.running = false;
  Live.paused = false;
  if (Live.stream) Live.stream.getTracks().forEach((t) => t.stop());
  if (Live.ctx) Live.ctx.close();
  Live.stream = Live.ctx = null;
  Live.speakQueue = [];
  $('#meter').style.width = '0';
  $('#btn-live').textContent = t('▶ Start');
  $('#btn-live').classList.replace('danger', 'primary');
  setLiveState(t('Not listening'));
}

function onLiveChunk(samples) {
  const dur = samples.length / AudioKit.SR;
  const start = Math.max(0, Live.offset + (performance.now() - Live.t0) / 1000 - dur);
  const line = { id: 'V' + ++Live.n, start, end: start + dur, ta: null, kn: null, gender: 'unknown' };
  Live.lines.push(line);
  const feed = $('#live-feed');
  const stick = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 120;
  const el = document.createElement('div');
  el.className = 'live-item';
  el.innerHTML = `<div class="meta">${fmtTime(start)}</div><div class="ta"></div><div class="kn pending">${t('Listening…')}</div>`;
  feed.appendChild(el);
  if (stick) feed.scrollTop = feed.scrollHeight;

  const heard = api.transcribe(AudioKit.encodeWav(AudioKit.normalize(samples), AudioKit.SR), false);
  // translate strictly in order, with the previous lines as context
  Live.translateChain = Live.translateChain.then(async () => {
    const kn = $('.kn', el);
    let r;
    try {
      r = await heard;
    } catch (e) {
      kn.className = 'kn err';
      kn.textContent = t('Could not hear this part: ') + errMsg(e);
      return;
    }
    line.ta = (r.transcript || '').trim();
    if (!line.ta) { el.remove(); Live.lines.splice(Live.lines.indexOf(line), 1); return; }
    $('.ta', el).textContent = line.ta;
    kn.textContent = t('Writing Kannada…');
    try {
      const context = Live.lines.filter((l) => l.kn).slice(-10).map((l) => ({ ta: l.ta, kn: l.kn, gender: l.gender }));
      const res = await api.translate([{ id: line.id, ta: line.ta }], context, true);
      const out = res.lines[0] || {};
      if (out.ta) { line.taHeard = line.ta; line.ta = out.ta; $('.ta', el).textContent = line.ta; $('.ta', el).title = t('Heard as: ') + line.taHeard; }
      line.kn = out.kn || '';
      line.gender = out.gender || 'unknown';
      kn.className = 'kn';
      kn.textContent = line.kn || '…';
      if (feed.scrollHeight - feed.scrollTop - feed.clientHeight < 240) feed.scrollTop = feed.scrollHeight;
      updateLiveCount();
      if (line.kn && $('#live-speak').checked && Live.running) queueLiveSpeech(line);
    } catch (e) {
      kn.className = 'kn err';
      kn.textContent = t('Could not translate: ') + errMsg(e);
    }
  }).catch(() => {});
}

/** Speak live lines in order; if speech falls behind, skip to the latest lines. */
function queueLiveSpeech(line) {
  Live.speakQueue.push(line);
  if (Live.speakQueue.length > 2) Live.speakQueue.splice(0, Live.speakQueue.length - 2);
  if (Live.speaking) return;
  Live.speaking = true;
  (async () => {
    while (Live.speakQueue.length) {
      const l = Live.speakQueue.shift();
      try { await Speaker.say(l.kn, l.gender); } catch (e) { toast('Voice failed: ' + errMsg(e), 'error'); break; }
    }
    Live.speaking = false;
  })();
}

// while Kannada is spoken during Live, don't listen (it would hear itself)
Speaker.onStart = () => {
  if (Live.running && $('#live-speak').checked) { Live.paused = true; setLiveState(t('Speaking Kannada'), 'speaking'); }
};
Speaker.onEnd = () => {
  if (!Live.paused) return;
  Live.paused = false;
  if (Live.seg) Live.seg.reset();
  if (Live.running) setLiveState(t('Listening'), 'on');
};

$('#btn-live-clear').onclick = () => {
  if (Live.lines.length && !confirm('Clear this live session?')) return;
  Live.lines = [];
  $('#live-feed').innerHTML = liveEmpty();
  updateLiveCount();
};

$('#btn-live-save').onclick = async () => {
  const lines = Live.lines.filter((l) => l.ta);
  if (!lines.length) return toast('Nothing heard yet.');
  const name = 'Live, ' + new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
  const project = {
    id: newId(), name, mediaName: 'Live capture', createdAt: Date.now(), updatedAt: Date.now(), duration: lines[lines.length - 1].end,
    lines: lines.map((l, i) => ({ id: 'L' + (i + 1), start: l.start, end: l.end, ta: l.ta, kn: l.kn, gender: l.gender, note: '' })),
  };
  await api.saveProject(project);
  await refreshProjects();
  toast(t('Saved to Episodes.'), { action: t('Open'), onAction: () => { showTab('episode'); openProject(project.id); } });
};

// ================================================================ SETTINGS
const KEY_FIELDS = ['sarvamKey', 'anthropicKey', 'kenpathKey'];
const FIELDS = [...KEY_FIELDS, 'glossary', 'storyNotes', 'translationEngine', 'claudeModel', 'ttsModel', 'voiceFemale', 'voiceMale', 'voiceAuto', 'pace', 'sttModel'];

function fillVoiceSelects() {
  const model = $('#ttsModel').value;
  const v = VOICES[model] || VOICES['svara-tts-turbo'];
  const name = (x) => VOICE_NAMES[x] || x.replace(/_kn_/, ' · ').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
  const group = (label, list) => `<optgroup label="${label}">${list.map((x) => `<option value="${x}">${name(x)}</option>`).join('')}</optgroup>`;
  const opts = group('Women', v.female) + group('Men', v.male);
  $('#voiceFemale').innerHTML = opts;
  $('#voiceMale').innerHTML = opts;
  const def = VOICE_DEFAULTS[model] || VOICE_DEFAULTS['svara-tts-turbo'];
  const has = (x) => v.female.includes(x) || v.male.includes(x);
  $('#voiceFemale').value = has(settings.voiceFemale) ? settings.voiceFemale : def.female;
  $('#voiceMale').value = has(settings.voiceMale) ? settings.voiceMale : def.male;
}

function loadSettingsForm() {
  for (const f of FIELDS) {
    const el = $('#' + f);
    if (el.type === 'checkbox') el.checked = !!settings[f];
    else el.value = settings[f] ?? '';
  }
  const style = $(`input[name=kannadaStyle][value="${settings.kannadaStyle || 'bengaluru'}"]`);
  if (style) style.checked = true;
  fillVoiceSelects();
  $('#voiceMale').disabled = !settings.voiceAuto;
  $('#pace-val').textContent = Number(settings.pace || 1).toFixed(2) + '×';
}

function readSettingsForm() {
  const patch = {};
  for (const f of FIELDS) {
    const el = $('#' + f);
    patch[f] = el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value;
  }
  patch.kannadaStyle = ($('input[name=kannadaStyle]:checked') || {}).value || 'bengaluru';
  return patch;
}

async function saveSettingsNow() {
  settings = await api.saveSettings(readSettingsForm());
  $('#claudeModel').value = settings.claudeModel; // a new Claude key resets this to Haiku
  renderKeyStatus();
  if ($('#view-settings').classList.contains('active')) renderDashboard();
}
const autosaveSettings = debounce(saveSettingsNow, 400);

for (const f of FIELDS) {
  const el = $('#' + f);
  const isKey = KEY_FIELDS.includes(f);
  el.addEventListener(el.tagName === 'SELECT' || el.type === 'checkbox' || isKey ? 'change' : 'input', () => {
    if (f === 'ttsModel') fillVoiceSelects();
    if (f === 'voiceAuto') $('#voiceMale').disabled = !el.checked;
    if (f === 'pace') $('#pace-val').textContent = Number(el.value).toFixed(2) + '×';
    autosaveSettings();
  });
}
$$('input[name=kannadaStyle]').forEach((r) => r.addEventListener('change', autosaveSettings));
// a key field shows a masked value; clear it on focus so a new key can be pasted
KEY_FIELDS.forEach((f) => {
  const el = $('#' + f);
  el.addEventListener('focus', () => { if (el.value.startsWith('••••')) el.select(); });
});

function keyResult(name, x) {
  if (x == null) return `<span class="muted">${t('{name}: not set', { name })}</span>`;
  return x.ok ? `<span class="ok">${t('✓ {name} works', { name })}</span>` : `<span class="bad">✗ ${name}: ${escapeHtml(x.error)}</span>`;
}
$('#btn-test').onclick = async () => {
  const out = $('#test-result');
  out.textContent = t('Checking…');
  $('#btn-test').disabled = true;
  try {
    await saveSettingsNow();
    loadSettingsForm();
    const r = await api.testKeys();
    out.innerHTML = keyResult('Sarvam', r.sarvam) + keyResult('Claude', r.anthropic) + keyResult('Kenpath', r.kenpath);
  } finally {
    $('#btn-test').disabled = false;
  }
};

$('#btn-preview-voice').onclick = async () => {
  if (needKeys()) return;
  await saveSettingsNow();
  const b = $('#btn-preview-voice');
  b.disabled = true;
  try {
    await Speaker.say('ನಮಸ್ಕಾರ! ನಾನು ಈ ಧಾರಾವಾಹಿಯ ಕನ್ನಡ ಧ್ವನಿ. ಹೇಗಿದೆ ಹೇಳಿ?', 'female');
    if (settings.voiceAuto) await Speaker.say('ಏನಮ್ಮಾ, ಊಟ ಆಯ್ತಾ? ನಾನು ಸ್ವಲ್ಪ ಹೊತ್ತಲ್ಲಿ ಬರ್ತೀನಿ.', 'male');
  } catch (e) {
    toast('Voice preview failed: ' + errMsg(e), { kind: 'error', ms: 8000 });
  } finally {
    b.disabled = false;
  }
};

// ================================================================ WELCOME (first run)
function showWelcome() {
  $('#welcome').classList.remove('hidden');
  setTimeout(() => $('#w-sarvam').focus(), 50);
}
$('#w-go').onclick = async () => {
  const sk = $('#w-sarvam').value.trim();
  const ck = $('#w-claude').value.trim();
  const kk = $('#w-kenpath').value.trim();
  const err = $('#w-error');
  if (!sk) { err.textContent = t('Please paste your Sarvam AI key.'); return $('#w-sarvam').focus(); }
  const btn = $('#w-go');
  btn.disabled = true;
  btn.textContent = t('Checking…');
  err.textContent = '';
  try {
    settings = await api.saveSettings({ sarvamKey: sk, anthropicKey: ck, kenpathKey: kk });
    const r = await api.testKeys();
    if (!r.sarvam || !r.sarvam.ok) {
      err.textContent = 'Sarvam key did not work: ' + (r.sarvam ? r.sarvam.error : 'missing');
      return;
    }
    if (ck && (!r.anthropic || !r.anthropic.ok)) {
      err.textContent = 'Claude key did not work: ' + (r.anthropic ? r.anthropic.error : '') + '. Fix it, or clear the box to continue without Claude.';
      return;
    }
    if (kk && (!r.kenpath || !r.kenpath.ok)) {
      err.textContent = 'Kenpath Labs key did not work: ' + (r.kenpath ? r.kenpath.error : '') + '. Fix it, or clear the box to use Sarvam voices.';
      return;
    }
    renderKeyStatus();
    loadSettingsForm();
    $('#welcome').classList.add('hidden');
    if (!settings.tutorialDone) Tour.open();
    else toast(t(ck ? 'All set! Open a Tamil episode to begin.' : 'Ready. Add a Claude key later in Settings for the best Kannada.'));
  } catch (e) {
    err.textContent = errMsg(e);
  } finally {
    btn.disabled = false;
    btn.textContent = t('Check keys & start');
  }
};
['#w-sarvam', '#w-claude', '#w-kenpath'].forEach((s) => $(s).addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#w-go').click(); }));

// ================================================================ keyboard
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeMenus();
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
  if (!$('#view-episode').classList.contains('active') || !E.project) return;
  const visible = E.project.lines.filter((l) => !E.els.get(l.id)?.classList.contains('hidden'));
  const idx = visible.findIndex((l) => l.id === E.currentId);
  const cur = visible[idx];
  if (e.code === 'Space') {
    const p = $('#player');
    if (!p.src) return;
    e.preventDefault();
    E.stopAt = null;
    p.paused ? p.play().catch(() => {}) : p.pause();
  } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const n = visible[Math.max(0, Math.min(visible.length - 1, idx + (e.key === 'ArrowDown' ? 1 : -1)))];
    if (n) { selectLine(n, true); scrollToLine(n); }
  } else if (e.key.toLowerCase() === 'k' && cur) {
    speakLine(cur);
  } else if (e.key.toLowerCase() === 'e' && cur) {
    e.preventDefault();
    const kn = $('.kn', E.els.get(cur.id));
    kn.focus();
    const r = document.createRange();
    r.selectNodeContents(kn);
    r.collapse(false);
    getSelection().removeAllRanges();
    getSelection().addRange(r);
  }
});

// ================================================================ usage dashboard
const fmtNum = (n) => Math.round(n || 0).toLocaleString(I18N.lang === 'kn' ? 'kn-IN' : 'en-IN');
const USD_INR = 88; // rough, for the combined total only

async function renderDashboard() {
  let u;
  try { u = await api.getUsage(); } catch { return; }
  const k = u.keys;
  const modelName = { 'claude-haiku-5-5': 'Haiku 5.5', 'claude-sonnet-5-5': 'Sonnet 5.5', 'claude-opus-5-5': 'Opus 5.5' }[u.claudeModel] || u.claudeModel;
  const kp = u.kenpath;
  const freeLeft = Math.max(0, kp.freeChars - kp.chars);
  const quota = kp.quota && Number.isFinite(kp.quota.remaining) ? kp.quota.remaining : null;
  const meterPct = Math.min(100, (kp.chars / kp.freeChars) * 100);
  const stat = (label, value) => `<div class="stat"><span>${t(label)}</span><b>${value}</b></div>`;
  const card = (cls, name, role, set, keyTail, body, cost, link) => `
    <article class="dash-card ${cls} ${set ? '' : 'off'}">
      <header><i class="logo">${name[0]}</i><div><b>${name}</b><small>${t(role)}</small></div>
        <span class="pill ${set ? 'ok' : ''}">${set ? t('Key added') + ' · ' + escapeHtml(keyTail) : t('No key')}</span></header>
      <div class="stats">${body}</div>
      <footer><span class="cost">${cost}</span><a href="${link}" target="_blank">${t('Open console')} ↗</a></footer>
    </article>`;
  const tail = (v) => String(v || '').slice(-4);
  const c = u.claude, s = u.sarvam;
  $('#dash').innerHTML =
    card('c-claude', 'Claude', 'Translation', k.anthropicKeySet, tail(k.anthropicKey),
      stat('Model', modelName) + stat('Requests', fmtNum(c.requests)) + stat('Tokens in', fmtNum(c.inputTokens)) + stat('Tokens out', fmtNum(c.outputTokens)) + stat('Cached tokens', fmtNum(c.cacheReadTokens)),
      '$' + c.costUsd.toFixed(c.costUsd < 1 ? 3 : 2), 'https://console.anthropic.com/settings/billing') +
    card('c-sarvam', 'Sarvam', 'Hearing Tamil', k.sarvamKeySet, tail(k.sarvamKey),
      stat('Audio heard', fmtNum(s.sttSeconds / 60) + ' ' + t('min')) + stat('Requests', fmtNum(s.sttRequests + s.ttsRequests)) + stat('Voice characters', fmtNum(s.ttsChars)) + stat('Translated characters', fmtNum(s.translateChars)),
      '₹' + s.costInr.toFixed(2), 'https://dashboard.sarvam.ai') +
    card('c-kenpath', 'Kenpath', 'Kannada voice', k.kenpathKeySet, tail(k.kenpathKey),
      stat('Characters spoken', fmtNum(kp.chars)) + stat('Requests', fmtNum(kp.requests)) + stat('Free this month', fmtNum(freeLeft)) +
      (quota != null ? stat('Left on your plan', fmtNum(quota)) : '') +
      `<div class="meter-row"><div class="meter big"><div class="meter-fill" style="width:${meterPct}%"></div></div></div>`,
      '₹' + kp.costInr.toFixed(2), 'https://platform.kenpathlabs.com/dashboard');
  const totalInr = c.costUsd * USD_INR + s.costInr + kp.costInr;
  $('#dash-total').innerHTML = `<div><span>${t('This month')}</span><b>${new Date(u.month + '-01').toLocaleDateString(I18N.lang === 'kn' ? 'kn-IN' : 'en-IN', { month: 'long', year: 'numeric' })}</b></div>
    <div><span>${t('Estimated spend')}</span><b>≈ ₹${totalInr.toFixed(2)}</b></div>`;
}
$('#btn-dash-refresh').onclick = renderDashboard;
$('#btn-dash-reset').onclick = async () => {
  if (!confirm(t('Reset this month\'s counters?'))) return;
  await api.resetUsage();
  renderDashboard();
};

// ================================================================ tutorial (first open, once)
const Tour = {
  i: 0,
  // One step per main control on the home screen; each one is spotlighted.
  steps: [
    { el: '#btn-open', title: 'New episode', text: 'Start here. Pick a Tamil episode (video or audio). Anuvaada listens, fixes the Tamil, and writes every line in natural Kannada.' },
    { el: '#dropzone', title: 'Drop a file', text: 'Or just drag the episode file onto this area. Big mp4 and mkv files work too.' },
    { el: '.sidebar', title: 'Saved work', text: 'Every episode you open is saved here automatically. Click one to continue where you left off.' },
    { el: '.tab[data-tab="live"]', title: 'Live', text: 'Watching on Sun NXT or YouTube? Open Live, press Start, and the Kannada appears as each line is spoken.' },
    { el: '.tab[data-tab="settings"]', title: 'Settings', text: 'Your keys, Kannada style, character names, voices, and a dashboard of what each service has used this month.' },
    { el: '#lang-btn', title: 'English / ಕನ್ನಡ', text: 'Switch the whole app between English and Kannada.' },
    { el: '#keystatus', title: 'Key status', text: 'Green means the key is set. Click it to go straight to your keys.' },
  ],
  open() {
    showTab('episode'); // steps whose control is hidden (e.g. an episode is open) show the card centred
    this.i = 0;
    $('#tour').classList.remove('hidden');
    this.render();
  },
  render() {
    const s = this.steps[this.i];
    const card = $('#tour-card');
    card.classList.remove('swap'); void card.offsetWidth; card.classList.add('swap');
    $('#tour-step').textContent = `${this.i + 1} / ${this.steps.length}`;
    $('#tour-title').textContent = t(s.title);
    $('#tour-text').textContent = t(s.text);
    this.place(s);
    $('#tour-dots').innerHTML = this.steps.map((_, j) => `<i class="${j === this.i ? 'on' : ''}"></i>`).join('');
    $('#tour-back').style.visibility = this.i ? 'visible' : 'hidden';
    $('#tour-next').textContent = this.i === this.steps.length - 1 ? t('Get started') : t('Next');
  },
  // Spotlight the control and put the card beside it, inside the window.
  place(s) {
    const target = $(s.el);
    const spot = $('#tour-spot'), card = $('#tour-card');
    if (!target || !target.offsetParent) { spot.style.cssText = 'opacity:0'; card.style.left = card.style.top = ''; card.classList.add('center'); return; }
    card.classList.remove('center');
    const r = target.getBoundingClientRect(), pad = 6;
    Object.assign(spot.style, { opacity: 1, left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
    const cw = card.offsetWidth, ch = card.offsetHeight, gap = 14, W = innerWidth, H = innerHeight;
    let top = r.bottom + gap, left = r.left + r.width / 2 - cw / 2;
    if (top + ch > H - 12) top = r.top - ch - gap; // no room below: above
    if (top < 12) { top = Math.max(12, Math.min(H - ch - 12, r.top + r.height / 2 - ch / 2)); left = r.right + gap; if (left + cw > W - 12) left = r.left - cw - gap; } // beside
    card.style.left = Math.max(12, Math.min(W - cw - 12, left)) + 'px';
    card.style.top = Math.max(12, Math.min(H - ch - 12, top)) + 'px';
  },
  async close() {
    $('#tour').classList.add('hidden');
    settings = await api.saveSettings({ tutorialDone: true });
  },
};
$('#tour-next').onclick = () => (Tour.i < Tour.steps.length - 1 ? (Tour.i++, Tour.render()) : Tour.close());
$('#tour-back').onclick = () => { if (Tour.i) { Tour.i--; Tour.render(); } };
$('#tour-skip').onclick = () => Tour.close();
$('#btn-tour').onclick = () => Tour.open();
addEventListener('resize', () => { if (!$('#tour').classList.contains('hidden')) Tour.place(Tour.steps[Tour.i]); });
document.addEventListener('keydown', (e) => {
  if ($('#tour').classList.contains('hidden')) return;
  if (e.key === 'Escape') Tour.close();
  if (e.key === 'ArrowRight' || e.key === 'Enter') $('#tour-next').click();
  if (e.key === 'ArrowLeft') $('#tour-back').click();
});

// ================================================================ English / Kannada
function applyLanguage(lang) {
  I18N.apply(lang);
  renderKeyStatus();
  refreshProjects();
  if (E.project) renderAllLines();
  setLiveSource(Live.source);
  if (!Live.running) { setLiveState(t('Not listening')); $('#btn-live').textContent = t('▶ Start'); } else $('#btn-live').textContent = t('■ Stop');
  if (!Live.lines.length) $('#live-feed').innerHTML = liveEmpty();
  updateLiveCount();
  if (!$('#tour').classList.contains('hidden')) Tour.render();
  if ($('#view-settings').classList.contains('active')) renderDashboard();
}
$('#lang-btn').onclick = async () => {
  const next = I18N.lang === 'kn' ? 'en' : 'kn';
  applyLanguage(next);
  settings = await api.saveSettings({ uiLang: next });
};

// ================================================================ boot
(async function boot() {
  settings = await api.getSettings();
  I18N.apply(settings.uiLang || 'en');
  loadSettingsForm();
  renderKeyStatus();
  $('#live-speak').checked = store.get('liveSpeak', false);
  setLiveSource('system');
  setLiveState(t('Not listening'));
  $('#btn-live').textContent = t('▶ Start');
  $('#live-feed').innerHTML = liveEmpty();
  await refreshProjects();
  const info = await api.appInfo();
  $('#app-version').textContent = `Anuvaada ${info.version}`;
  if (!settings.sarvamKeySet) showWelcome();
  else if (!settings.tutorialDone) Tour.open();
  document.body.classList.add('ready');
})();
