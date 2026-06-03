#!/usr/bin/env node
// One-off: take the approved cartoon dog and edit ONLY (1) white paws and
// (2) a flat chroma-green background — via Gemini image-to-image. Preserves the
// exact dog so the green proof uses the dog Scott liked, not a fresh drift.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

for (const ENV_PATH of [path.join(ROOT, '.env'), path.resolve(ROOT, '../../../.env')]) {
  if (!fs.existsSync(ENV_PATH)) continue;
  for (const line of fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"]*?)"?\s*$/);
    if (m) process.env[m[1]] ||= m[2];
  }
}

const SRC = path.join(ROOT, 'mascots', 'dog', 'master.png');
const OUT = path.join(ROOT, 'mascots', 'dog', 'green', 'master.png');
const MODEL = 'gemini-2.5-flash-image';

const PROMPT = 'You are editing this image. Keep the EXACT same cartoon dog — identical art style, pose, body, face, happy expression, and black-and-white markings. Make ONLY these two changes: (1) give the dog clean solid WHITE paws/socks on all four feet; (2) replace the ENTIRE background with one flat, solid, uniform pure chroma-key green (#00FF00) filling the whole frame edge-to-edge behind the dog, with no gradient, no shadow, no texture. Absolutely do NOT add any hat, beanie, bandana, scarf, collar, tag, or any prop, and do NOT add text. The dog itself must stay exactly as it is apart from the white paws.';

const key = process.env.GEMINI_API_KEY;
if (!key) throw new Error('GEMINI_API_KEY missing');
const srcB64 = fs.readFileSync(SRC).toString('base64');
const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;

let saved = false;
for (let attempt = 1; attempt <= 4 && !saved; attempt++) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: PROMPT }, { inlineData: { mimeType: 'image/png', data: srcB64 } }] }],
    }),
  });
  if (!res.ok) {
    if (res.status === 503 || res.status === 429) { await new Promise(r => setTimeout(r, 6000)); continue; }
    throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 400)}`);
  }
  const json = await res.json();
  const img = (json?.candidates?.[0]?.content?.parts || []).find(p => p.inlineData?.data)?.inlineData?.data;
  if (!img) throw new Error('No image in response: ' + JSON.stringify(json).slice(0, 300));
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, Buffer.from(img, 'base64'));
  saved = true;
}
console.log(saved ? `ok → ${OUT} (${(fs.statSync(OUT).size / 1024).toFixed(0)} KB)` : 'FAILED after retries');
