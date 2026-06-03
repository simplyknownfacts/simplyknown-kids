#!/usr/bin/env node
// Round 2: bold, clearly-distinct dog styles via Imagen 4 TEXT-to-image.
// (Round 1 image-to-image anchored too hard on the source for "near" styles.)
// Same dog described in words so identity holds; style pushed hard.

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

const OUT_DIR = path.join(ROOT, 'mascots', 'dog', 'styles');

// Consistent dog identity across every style.
const DOG = 'a cute black pit-bull-terrier-type mutt puppy sitting upright and facing forward, glossy solid-black coat, a white blaze running down the muzzle and over the nose, a white chest patch, and all four paws clearly white like little white socks, big round friendly dark eyes, soft folded-over ears, mouth slightly open in a happy smile, full body visible and centered, on a plain soft pastel cream background';

const STYLES = [
  { id: 'pixar3d', prompt: `A polished 3D animated-movie character render of ${DOG}. Pixar / DreamWorks CGI style: fully three-dimensional sculpted volume, soft global illumination with a gentle rim light, glossy eyes with bright catch-lights, fluffy fur with subsurface scattering, smooth rounded appealing shapes, cinematic studio lighting and shallow depth of field. Looks exactly like a frame from a modern 3D animated feature film. NOT a flat 2D drawing.` },
  { id: 'watercolor', prompt: `A soft hand-painted watercolor children's-storybook illustration of ${DOG}. Loose wet-on-wet watercolor washes with visible paper grain and brush texture, gentle bleeding color edges, delicate ink linework, muted pastel palette, whimsical warm picture-book art. Clearly a traditional watercolor painting.` },
  { id: 'pixelart', prompt: `A retro 16-bit pixel-art video-game sprite of ${DOG}. Crisp blocky visible square pixels, a strictly limited color palette, dithered shading, clean 1-pixel outline, looks like a character sprite from a classic SNES-era game. Unmistakably pixel art, low resolution aesthetic, on a simple flat pixel background.` },
  { id: 'comic', prompt: `A bold pop-art comic-book panel of ${DOG}. Thick heavy black ink outlines, flat vibrant primary colors, Ben-Day halftone dot shading, sharp cel-shaded highlights, vintage printed-comic look, high contrast and energetic. Clearly a hand-inked comic illustration.` },
];

async function genImage(prompt, outPath) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY missing');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${key}`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ instances: [{ prompt }], parameters: { sampleCount: 1, aspectRatio: '1:1' } }),
    });
    if (res.ok) {
      const json = await res.json();
      const b64 = json?.predictions?.[0]?.bytesBase64Encoded;
      if (!b64) throw new Error('no image: ' + JSON.stringify(json).slice(0, 300));
      fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
      return;
    }
    if (res.status === 503 || res.status === 429) {
      await new Promise(r => setTimeout(r, 6000));
      continue;
    }
    throw new Error(`Imagen ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  throw new Error('retries exhausted (503/429)');
}

const only = process.argv[2];
const toRun = only ? STYLES.filter(s => s.id === only) : STYLES;
fs.mkdirSync(OUT_DIR, { recursive: true });

let done = 0, failed = 0;
for (const s of toRun) {
  const outPath = path.join(OUT_DIR, `${s.id}.png`);
  try {
    process.stdout.write(`→ ${s.id} ... `);
    await genImage(s.prompt, outPath);
    console.log(`ok (${(fs.statSync(outPath).size / 1024).toFixed(0)} KB)`);
    done++;
  } catch (e) {
    console.log(`FAIL — ${e.message}`);
    failed++;
  }
}
console.log(`\n${done}/${toRun.length} done, ${failed} failed → ${OUT_DIR}`);
