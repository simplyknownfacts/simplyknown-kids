// Generate a clean front-facing kids "body parts" teaching figure (Imagen).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const p of [path.join(ROOT, '.env'), path.resolve(ROOT, '../../../.env')]) {
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"]*?)"?\s*$/); if (m) process.env[m[1]] ||= m[2];
  }
}
const key = process.env.GEMINI_API_KEY;
const OUT = path.join(ROOT, 'learning', 'img', 'body-kid.png');
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const prompt = 'A friendly simple cartoon child for a preschool "label the body parts" learning poster. The child stands straight facing forward, smiling, with both arms held out a little away from the body and hands open, legs slightly apart, shown full body from the top of the head down to the feet, centered. Clear, distinct, easy-to-point-to body parts: head, hair, two eyes, nose, mouth, two ears, two arms, two hands, belly/tummy, two legs, two feet. Bright flat kids-book illustration with bold clean outlines, gender-neutral, wearing a plain short-sleeve t-shirt and shorts so arms and legs are clearly visible. A single flat solid pale background, no shadows, NO text, NO labels, NO arrows.';
const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${key}`;
const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'},
  body: JSON.stringify({ instances:[{prompt}], parameters:{ sampleCount:1, aspectRatio:'3:4' } }) });
if (!res.ok) { console.log('Imagen ' + res.status + ': ' + (await res.text()).slice(0,300)); process.exit(1); }
const b64 = (await res.json())?.predictions?.[0]?.bytesBase64Encoded;
if (!b64) { console.log('no image'); process.exit(1); }
fs.writeFileSync(OUT, Buffer.from(b64, 'base64'));
console.log('ok → ' + OUT + ' (' + (fs.statSync(OUT).size/1024).toFixed(0) + ' KB)');
