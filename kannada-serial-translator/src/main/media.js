'use strict';
// Extract the sound track of any episode file (mp4, mkv, avi, AC3/AAC/Opus…) as
// 16 kHz mono 16-bit PCM using the bundled ffmpeg. Works for multi-GB files
// without loading the video into memory.
const { spawn } = require('child_process');
const fs = require('fs');

function ffmpegPath() {
  try {
    let p = require('ffmpeg-static');
    // inside a packaged app the binary lives in app.asar.unpacked
    p = p && p.replace('app.asar' + require('path').sep, 'app.asar.unpacked' + require('path').sep);
    if (p && fs.existsSync(p)) return p;
  } catch {}
  return null;
}

function extractPcm16k(file) {
  return new Promise((resolve, reject) => {
    const bin = ffmpegPath();
    if (!bin) return reject(new Error('ffmpeg not available'));
    const args = ['-hide_banner', '-loglevel', 'error', '-i', file, '-vn', '-ac', '1', '-ar', '16000', '-f', 's16le', 'pipe:1'];
    const p = spawn(bin, args, { windowsHide: true });
    const chunks = [];
    let err = '';
    p.stdout.on('data', (d) => chunks.push(d));
    p.stderr.on('data', (d) => (err += d.toString()));
    p.on('error', reject);
    p.on('close', (code) => {
      const buf = Buffer.concat(chunks);
      if (code === 0 && buf.length) resolve(buf);
      else reject(new Error(err.trim().split('\n').pop() || 'Could not read audio (code ' + code + ')'));
    });
  });
}

module.exports = { extractPcm16k, ffmpegPath };
