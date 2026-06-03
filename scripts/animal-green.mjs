#!/usr/bin/env node
// Generic: take a mascot's approved cartoon master and swap ONLY the background
// to flat chroma-green (image-to-image), preserving the exact character — so the
// green build reuses the animal you already have, not a fresh drift.
// Usage: node scripts/animal-green.mjs <mascotId>

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const p of [path.join(ROOT, '.env'), path.resolve(ROOT, '../../../.env')]) {
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"]*?)"?\s*$/);
    if (m) process.env[m[1]] ||= m[2];
  }
}

const id = process.argv[2];
if (!id) { console.error('usage: animal-green.mjs <mascotId>'); process.exit(1); }
const SRC = path.join(ROOT, 'mascots', id, 'master.png');
const OUT = path.join(ROOT, 'mascots', id, 'green', 'master.png');
if (!fs.existsSync(SRC)) { console.error(`no source master: ${SRC}`); process.exit(1); }
if (fs.existsSync(OUT) && fs.statSync(OUT).size > 1000) { console.log(`✓ green master exists for ${id}`); process.exit(0); }

const PROMPT = 'You are editing this image. Keep the EXACT same cartoon animal character — identical art style, pose, body, face, expression, colors, and markings. Change ONLY the background: replace it with one flat, solid, uniform pure chroma-key green (#00FF00) filling the entire frame edge-to-edge behind the character, with no gradient, shadow, or texture. Do NOT add any props, hats, accessories, or text. The character itself must stay exactly as it is.';
const key = process.env.GEMINI_API_KEY;
if (!key) throw new Error('GEMINI_API_KEY missing');
const srcB64 = fs.readFileSync(SRC).toString('base64');
const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent?key=${key}`;

let saved = false;
for (let attempt = 1; attempt <= 4 && !saved; attempt++) {
  const res = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: PROMPT }, { inlineData: { mimeType: 'image/png', data: srcB64 } }] }] }),
  });
  if (!res.ok) {
    if (res.status === 503 || res.status === 429) { await new Promise(r => setTimeout(r, 6000)); continue; }
    throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const j = await res.json();
  const img = (j?.candidates?.[0]?.content?.parts || []).find(p => p.inlineData?.data)?.inlineData?.data;
  if (!img) throw new Error('no image: ' + JSON.stringify(j).slice(0, 200));
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, Buffer.from(img, 'base64'));
  saved = true;
}
console.log(saved ? `ok → ${OUT}` : 'FAILED');
