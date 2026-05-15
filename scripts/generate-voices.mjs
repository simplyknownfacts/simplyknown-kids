#!/usr/bin/env node
// Generate ElevenLabs MP3 clips for every phrase in js/voice-manifest.js.
//
// Usage:
//   set ELEVENLABS_API_KEY=xxx   (or put in .env)
//   node scripts/generate-voices.mjs           # generate both voices
//   node scripts/generate-voices.mjs --voice girl
//   node scripts/generate-voices.mjs --dry     # cost estimate only
//
// Idempotent: skips clips that already exist on disk.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);
const { VOICE_MANIFEST } = require(path.join(PROJECT_ROOT, 'js', 'voice-manifest.js'));

// Load .env if present
const ENV_PATH = path.join(PROJECT_ROOT, '.env');
if (fs.existsSync(ENV_PATH)) {
  for (const line of fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"]*?)"?\s*$/);
    if (m) process.env[m[1]] ||= m[2];
  }
}

const API_KEY = process.env.ELEVENLABS_API_KEY;
if (!API_KEY && !process.argv.includes('--dry')) {
  console.error('ELEVENLABS_API_KEY not set. Add to .env or environment.');
  process.exit(1);
}

// Default voice IDs — nurturing kid-friendly options from ElevenLabs library.
// Override via env: EL_VOICE_GIRL, EL_VOICE_BOY
const VOICES = {
  girl: process.env.EL_VOICE_GIRL || 'EXAVITQu4vr4xnSDxMaL', // "Sarah" - warm female
  boy:  process.env.EL_VOICE_BOY  || 'TxGEqnHWrfWFTfGW9XjX', // "Josh" - young male
};

const MODEL_ID = process.env.EL_MODEL || 'eleven_turbo_v2_5'; // cheap + fast
const USD_PER_1K_CHARS = 0.30; // approximate pay-as-you-go rate

const args = process.argv.slice(2);
const isDry = args.includes('--dry');
const onlyVoice = args.includes('--voice') ? args[args.indexOf('--voice') + 1] : null;
const voicesToRun = onlyVoice ? [onlyVoice] : Object.keys(VOICES);

const clips = VOICE_MANIFEST.allClips;

// Cost estimate
let charsToGenerate = 0;
let toGenerate = [];
for (const voice of voicesToRun) {
  const voiceDir = path.join(PROJECT_ROOT, 'audio', voice);
  fs.mkdirSync(voiceDir, { recursive: true });
  for (const text of clips) {
    const filename = VOICE_MANIFEST.hash(text) + '.mp3';
    const filepath = path.join(voiceDir, filename);
    if (fs.existsSync(filepath) && fs.statSync(filepath).size > 100) continue;
    toGenerate.push({ voice, text, filepath });
    charsToGenerate += text.length;
  }
}

const estCost = (charsToGenerate / 1000) * USD_PER_1K_CHARS;
console.log(`Manifest: ${clips.length} clips × ${voicesToRun.length} voices = ${clips.length * voicesToRun.length} total`);
console.log(`To generate: ${toGenerate.length} new clips, ${charsToGenerate} characters`);
console.log(`Estimated cost: $${estCost.toFixed(2)} USD`);

if (isDry) {
  console.log('\nDry run — no API calls made.');
  process.exit(0);
}

if (estCost > 8) {
  console.error(`Cost estimate ($${estCost.toFixed(2)}) exceeds $8 budget. Aborting.`);
  process.exit(1);
}

if (toGenerate.length === 0) {
  console.log('All clips already generated. Nothing to do.');
  process.exit(0);
}

// Generate
let done = 0, failed = 0;
for (const { voice, text, filepath } of toGenerate) {
  const voiceId = VOICES[voice];
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: MODEL_ID,
        voice_settings: { stability: 0.55, similarity_boost: 0.75, style: 0.30 },
      }),
    });
    if (!res.ok) {
      console.error(`  ✗ [${voice}] "${text}" — HTTP ${res.status}: ${await res.text()}`);
      failed++;
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(filepath, buf);
    done++;
    if (done % 10 === 0) console.log(`  ${done}/${toGenerate.length} done...`);
  } catch (err) {
    console.error(`  ✗ [${voice}] "${text}" — ${err.message}`);
    failed++;
  }
}

console.log(`\nGenerated ${done} clips, ${failed} failures.`);
console.log(`Output: audio/{girl,boy}/`);
