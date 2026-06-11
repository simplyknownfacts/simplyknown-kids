#!/usr/bin/env node
// Re-key a mascot's green master to PURE chroma green (#00FF00) and verify.
//
// Why: Imagen/Gemini "chroma green" backgrounds come out olive (e.g. 164,199,104).
// Weak green + mp4 compression = the v96 keying-haze bug. This samples the actual
// corner color (via ffmpeg rawvideo crop — repo stays dependency-free), colorkeys
// it to transparent, composites onto pure green, and verifies corners read
// exactly (0,255,0) before any video money is spent.
//
// Usage: node scripts/rekey-green.mjs <mascotId> [...more ids]
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function samplePx(file, x, y) {
  const r = spawnSync('ffmpeg', ['-loglevel', 'error', '-i', file,
    '-vf', `crop=1:1:${x}:${y}`, '-frames:v', '1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
    { maxBuffer: 1024 * 1024 });
  if (r.status !== 0 || !r.stdout || r.stdout.length < 3) throw new Error(`pixel sample failed: ${r.stderr}`);
  return [r.stdout[0], r.stdout[1], r.stdout[2]];
}

function dims(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height', '-of', 'csv=s=x:p=0', file], { encoding: 'utf8' });
  const [w, h] = (r.stdout || '').trim().split('x').map(Number);
  if (!w || !h) throw new Error('ffprobe failed');
  return [w, h];
}

let anyFail = false;
for (const id of process.argv.slice(2)) {
  try {
    const file = path.join(ROOT, 'mascots', id, 'green', 'master.png');
    if (!fs.existsSync(file)) { console.error(`${id}: NO green master`); anyFail = true; continue; }
    const [w, h] = dims(file);
    const [r, g, b] = samplePx(file, 8, 8);
    if (r === 0 && g === 255 && b === 0) { console.log(`${id}: already pure green`); continue; }
    const keyHex = ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
    const tmp = file + '.rekey.png';
    const ff = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', file, '-filter_complex',
      `color=0x00FF00:s=${w}x${h},format=rgba[bg];[0:v]colorkey=0x${keyHex}:0.13:0.02,format=rgba[fg];[bg][fg]overlay=format=auto`,
      '-frames:v', '1', tmp]);
    if (ff.status !== 0) { console.error(`${id}: ffmpeg failed: ${ff.stderr}`); anyFail = true; continue; }
    const checks = [[8, 8], [w - 9, 8], [8, h - 9], [Math.floor(w / 2), 12]];
    const bad = checks.find(([x, y]) => { const [cr, cg, cb] = samplePx(tmp, x, y); return cr !== 0 || cg !== 255 || cb !== 0; });
    if (bad) { console.error(`${id}: REKEY FAILED — corner ${bad} not pure green`); fs.unlinkSync(tmp); anyFail = true; continue; }
    fs.renameSync(tmp, file);
    console.log(`${id}: rekeyed (was ${r},${g},${b}) → pure green, verified`);
  } catch (e) { console.error(`${id}: ${e.message}`); anyFail = true; }
}
process.exit(anyFail ? 1 : 0);
