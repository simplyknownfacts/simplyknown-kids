#!/usr/bin/env node
// One-off: restyle the existing dog master.png into N art/animation styles via
// Gemini image-to-image (nano-banana). Preserves the same dog + pose, adds white paws.
//
// Usage:
//   node scripts/dog-styles.mjs            # all styles
//   node scripts/dog-styles.mjs realistic  # one style by id

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Load .env — check this worktree, then fall back to the main repo root
// (worktrees don't get a copy of the gitignored .env).
for (const ENV_PATH of [path.join(ROOT, '.env'), path.resolve(ROOT, '../../../.env')]) {
  if (!fs.existsSync(ENV_PATH)) continue;
  for (const line of fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"]*?)"?\s*$/);
    if (m) process.env[m[1]] ||= m[2];
  }
}

const SRC = path.join(ROOT, 'mascots', 'dog', 'master.png');
const OUT_DIR = path.join(ROOT, 'mascots', 'dog', 'styles');
const MODEL = 'gemini-2.5-flash-image';

// Shared identity instruction — keep the SAME dog and pose, just add white paws + restyle.
const KEEP = 'Keep the exact same dog character, same sitting-upright pose, same happy expression with mouth slightly open, and the same overall composition and pastel background as the provided image. The dog is a black pit-bull-type mutt puppy with a white nose blaze and a white chest. Add clean white paws/socks on all four feet. Do not change the breed, pose, or layout — only restyle the rendering.';

const STYLES = [
  { id: 'realistic', prompt: `Re-render this image as a PHOTOREALISTIC photograph of a real puppy — as realistic as possible, like a high-quality DSLR studio photo with natural fur texture, real lighting, shallow depth of field. ${KEEP}` },
  { id: 'pixar3d',   prompt: `Re-render in a glossy modern 3D animated-movie style (Pixar / DreamWorks CGI look) — smooth rounded forms, soft cinematic lighting, subsurface-scattered fur, big expressive eyes. ${KEEP}` },
  { id: 'anime',     prompt: `Re-render in a Japanese anime style — clean bold cel-shaded lines, flat color blocks, expressive shiny anime eyes, soft gradient shadows. ${KEEP}` },
  { id: 'disney2d',  prompt: `Re-render in a classic hand-drawn 2D Disney feature-animation style — soft painted watercolor-and-ink look, warm storybook shading, gentle outlines. ${KEEP}` },
  { id: 'claymation',prompt: `Re-render as a claymation / stop-motion clay figure (Aardman style) — visible fingerprints and sculpted clay texture, matte plasticine surface, soft studio lighting. ${KEEP}` },
  { id: 'vector',    prompt: `Re-render in a flat modern vector / motion-graphics style — clean geometric shapes, bold flat colors, minimal gradients, crisp edges, simple shapes. ${KEEP}` },
];

async function restyle(srcB64, prompt, outPath) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY missing');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${key}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          { inlineData: { mimeType: 'image/png', data: srcB64 } },
        ],
      }],
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const json = await res.json();
  const parts = json?.candidates?.[0]?.content?.parts || [];
  const img = parts.find(p => p.inlineData?.data)?.inlineData?.data;
  if (!img) throw new Error('No image in response: ' + JSON.stringify(json).slice(0, 400));
  fs.writeFileSync(outPath, Buffer.from(img, 'base64'));
  return outPath;
}

const only = process.argv[2];
const toRun = only ? STYLES.filter(s => s.id === only) : STYLES;
if (!toRun.length) { console.error('Unknown style: ' + only + '. Have: ' + STYLES.map(s => s.id).join(', ')); process.exit(1); }

fs.mkdirSync(OUT_DIR, { recursive: true });
const srcB64 = fs.readFileSync(SRC).toString('base64');

let done = 0, failed = 0;
for (const s of toRun) {
  const outPath = path.join(OUT_DIR, `${s.id}.png`);
  try {
    process.stdout.write(`→ ${s.id} ... `);
    await restyle(srcB64, s.prompt, outPath);
    console.log(`ok (${(fs.statSync(outPath).size / 1024).toFixed(0)} KB)`);
    done++;
  } catch (e) {
    console.log(`FAIL — ${e.message}`);
    failed++;
  }
}
console.log(`\n${done}/${toRun.length} done, ${failed} failed → ${OUT_DIR}`);
process.exit(failed && !done ? 1 : 0);
