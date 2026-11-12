'use strict';
// Saved episodes. Each project is one JSON file; a small in-memory index keeps the
// "Saved work" list fast, and writes go to a temp file first so a crash or power
// cut can never leave a half-written (corrupt) episode behind.
const fs = require('fs');
const path = require('path');

let dir = null;
let index = null; // Map id -> meta

const safeId = (id) => String(id).replace(/[^a-zA-Z0-9_-]/g, '');
const fileOf = (id) => path.join(dir, safeId(id) + '.json');

function meta(p) {
  const lines = p.lines || [];
  return {
    id: p.id,
    name: p.name,
    updatedAt: p.updatedAt || 0,
    lines: lines.length,
    done: lines.filter((l) => l.kn).length,
    pending: lines.filter((l) => l.kn == null && l.ta).length,
    failed: lines.filter((l) => l.error).length,
  };
}

function init(userDataDir) {
  dir = path.join(userDataDir, 'projects');
  fs.mkdirSync(dir, { recursive: true });
  index = new Map();
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    try {
      const p = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (p && p.id) index.set(p.id, meta(p));
    } catch {
      /* skip unreadable file */
    }
  }
}

function save(project) {
  if (!project || !project.id) throw new Error('Invalid project');
  const target = fileOf(project.id);
  const tmp = target + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(project));
  fs.renameSync(tmp, target);
  index.set(project.id, meta(project));
  return true;
}

function list() {
  return [...index.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

function load(id) {
  const f = fileOf(id);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
}

function remove(id) {
  const f = fileOf(id);
  if (fs.existsSync(f)) fs.unlinkSync(f);
  index.delete(id);
  return true;
}

module.exports = { init, save, list, load, remove };
