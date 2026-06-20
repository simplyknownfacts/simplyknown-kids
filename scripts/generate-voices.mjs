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
import { spawn, execSync } from 'node:child_process';

async function _pitchShift(inPath, outPath, ratio) {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', ['-y', '-i', inPath, '-af',
      `asetrate=44100*${ratio},aresample=44100,atempo=1/${ratio}`,
      outPath]);
    ff.on('close', code => code === 0 ? resolve() : reject(new Error('ffmpeg exit ' + code)));
    ff.on('error', reject);
  });
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);
const { VOICE_MANIFEST } = require(path.join(PROJECT_ROOT, 'js', 'voice-manifest.js'));

// Load .env — check this checkout's root first, then (when running inside a git
// worktree) the MAIN repo root. Shared secrets like ELEVENLABS_API_KEY live in
// the main checkout's .env, not the per-worktree copy. git-common-dir gives the
// main .git dir for any worktree; its parent is the main repo root. First value
// set wins (||=), so a worktree .env still overrides the main one.
function mainRepoRoot() {
  try {
    const common = execSync('git rev-parse --git-common-dir', { cwd: PROJECT_ROOT })
      .toString().trim();
    const abs = path.isAbsolute(common) ? common : path.resolve(PROJECT_ROOT, common);
    return path.dirname(abs);
  } catch { return null; }
}
const ENV_PATHS = [path.join(PROJECT_ROOT, '.env')];
const _mr = mainRepoRoot();
if (_mr && _mr !== PROJECT_ROOT) ENV_PATHS.push(path.join(_mr, '.env'));
for (const ENV_PATH of ENV_PATHS) {
  if (!fs.existsSync(ENV_PATH)) continue;
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
  boy:  process.env.EL_VOICE_BOY  || 'TX3LPaxmHKxFdv7VOQHJ', // "Liam" - energetic young male (was Josh, too deep)
  woman: process.env.EL_VOICE_WOMAN || '21m00Tcm4TlvDq8ikWAM', // "Rachel" - adult woman (natural, no pitch)
  man:   process.env.EL_VOICE_MAN   || 'pNInz6obpgDQGcFmaJgB', // "Adam" - adult man (natural, no pitch)
};
// Only kid voices get the +3-semitone pitch-up; grown-up voices stay natural.
const KID_VOICES = new Set(['girl', 'boy']);
const PITCH_RATIO = 1.189207;

const MODEL_ID = process.env.EL_MODEL || 'eleven_turbo_v2_5'; // cheap + fast
const USD_PER_1K_CHARS = 0.30; // approximate pay-as-you-go rate

const args = process.argv.slice(2);
const isDry = args.includes('--dry');
const onlyVoice = args.includes('--voice') ? args[args.indexOf('--voice') + 1] : null;
const voicesToRun = onlyVoice ? [onlyVoice] : Object.keys(VOICES);

const clips = VOICE_MANIFEST.allClips;
const animals = VOICE_MANIFEST.animals || [];

// TTS pass
let charsToGenerate = 0;
let toGenerate = [];
for (const voice of voicesToRun) {
  const voiceDir = path.join(PROJECT_ROOT, 'audio', voice);
  fs.mkdirSync(voiceDir, { recursive: true });
  for (const text of clips) {
    const filename = VOICE_MANIFEST.hash(text) + '.mp3';
    const filepath = path.join(voiceDir, filename);
    if (fs.existsSync(filepath) && fs.statSync(filepath).size > 100) continue;
    toGenerate.push({ kind: 'tts', voice, text, filepath });
    charsToGenerate += text.length;
  }
}

// SFX pass — one clip per animal id, voice-agnostic
const SFX_DIR = path.join(PROJECT_ROOT, 'audio', 'sounds');
fs.mkdirSync(SFX_DIR, { recursive: true });
let sfxToGenerate = 0;
for (const a of animals) {
  const filepath = path.join(SFX_DIR, `${a.id}.mp3`);
  if (fs.existsSync(filepath) && fs.statSync(filepath).size > 100) continue;
  toGenerate.push({ kind: 'sfx', animal: a, filepath });
  sfxToGenerate++;
}

const USD_PER_SFX = 0.08; // approximate per-generation cost
const ttsCost = (charsToGenerate / 1000) * USD_PER_1K_CHARS;
const sfxCost = sfxToGenerate * USD_PER_SFX;
const estCost = ttsCost + sfxCost;
console.log(`Manifest: ${clips.length} clips × ${voicesToRun.length} voices = ${clips.length * voicesToRun.length} total`);
console.log(`To generate: ${toGenerate.length - sfxToGenerate} TTS clips (${charsToGenerate} chars, $${ttsCost.toFixed(2)})`);
console.log(`             ${sfxToGenerate} SFX clips ($${sfxCost.toFixed(2)})`);
console.log(`Estimated total cost: $${estCost.toFixed(2)} USD`);

if (isDry) {
  console.log('\nDry run — no API calls made.');
  process.exit(0);
}

const BUDGET = Number(process.env.VOICE_BUDGET || 8);
if (estCost > BUDGET) {
  console.error(`Cost estimate ($${estCost.toFixed(2)}) exceeds $${BUDGET} budget. Aborting.`);
  process.exit(1);
}

if (toGenerate.length === 0) {
  console.log('All clips already generated. Nothing to do.');
  process.exit(0);
}

// Generate
let done = 0, failed = 0;
for (const item of toGenerate) {
  let res, body, url, label;
  try {
    if (item.kind === 'tts') {
      const voiceId = VOICES[item.voice];
      url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
      body = {
        text: item.text,
        model_id: MODEL_ID,
        voice_settings: { stability: 0.55, similarity_boost: 0.75, style: 0.30 },
      };
      label = `[${item.voice}] "${item.text}"`;
    } else { // sfx
      url = 'https://api.elevenlabs.io/v1/sound-generation';
      body = {
        text: `a single short ${item.animal.name.toLowerCase()} ${item.animal.sound.toLowerCase()} sound, clear and isolated, no music`,
        duration_seconds: 2,
        prompt_influence: 0.5,
      };
      label = `[sfx] ${item.animal.id}`;
    }
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error(`  ✗ ${label} — HTTP ${res.status}: ${await res.text()}`);
      failed++;
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (item.kind === 'tts' && KID_VOICES.has(item.voice)) {
      // kid voices: write raw, pitch-shift +3 semitones, replace
      const rawPath = item.filepath + '.raw.mp3';
      fs.writeFileSync(rawPath, buf);
      await _pitchShift(rawPath, item.filepath, PITCH_RATIO);
      fs.unlinkSync(rawPath);
    } else {
      // grown-up voices (woman/man) + SFX: keep natural, no pitch
      fs.writeFileSync(item.filepath, buf);
    }
    done++;
    if (done % 10 === 0) console.log(`  ${done}/${toGenerate.length} done...`);
  } catch (err) {
    console.error(`  ✗ ${label || 'item'} — ${err.message}`);
    failed++;
  }
}

console.log(`\nGenerated ${done} clips, ${failed} failures.`);
console.log(`Output: audio/{${voicesToRun.join(',')}}/`);
