#!/usr/bin/env node
// Mascot pipeline: Gemini Imagen 3 → ElevenLabs → Kling lip-sync.
//
// Usage:
//   node scripts/generate-mascot.mjs <mascot> --image-only
//   node scripts/generate-mascot.mjs <mascot> --one-clip
//   node scripts/generate-mascot.mjs <mascot> --full
//
// Mascots defined below (MASCOTS const). Output → mascots/<id>/

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Load .env
const ENV_PATH = path.join(ROOT, '.env');
if (fs.existsSync(ENV_PATH)) {
  for (const line of fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"]*?)"?\s*$/);
    if (m) process.env[m[1]] ||= m[2];
  }
}

const MASCOTS = {
  dog:     { name: 'Dog',     prompt: 'a friendly black pit bull mutt puppy with a white nose and white chest, sitting upright, big expressive eyes, cute cartoon illustration, kids book style, plain soft pastel background, full body visible, mouth slightly open in a happy smile' },
  tiger:   { name: 'Tiger',   prompt: 'a friendly cartoon tiger cub sitting upright, big expressive eyes, orange and black stripes, white chest and belly, plain soft pastel background, kids book illustration style, full body visible, mouth slightly open in a happy smile' },
  giraffe: { name: 'Giraffe', prompt: 'a friendly cartoon baby giraffe standing upright, long neck visible, big expressive eyes, yellow and brown spots, plain soft pastel background, kids book illustration style, full body visible, mouth slightly open in a happy smile' },
  panda:   { name: 'Panda',   prompt: 'a friendly cartoon baby panda sitting upright, big expressive eyes, classic black and white markings, plain soft pastel background, kids book illustration style, full body visible, mouth slightly open in a happy smile' },
  orca:    { name: 'Orca',    prompt: 'a friendly cartoon baby orca whale, smiling, big expressive eyes, glossy black and white skin, water-blue gradient background, kids book illustration style, body in playful pose, mouth slightly open showing a friendly smile' },
  eagle:   { name: 'Eagle',   prompt: 'a friendly cartoon bald eagle, big expressive eyes, white head, brown body, golden beak slightly open in a friendly smile, plain soft pastel background, kids book illustration style, perched upright' },
};

const PHRASES = [
  { key: 'welcome',     text: 'Welcome to your play space! Click what you want to do today!',
    motion: 'The character waves both arms in a friendly greeting, smiles warmly, body bounces with excitement, gestures outward to invite the viewer in.' },
  { key: 'games_intro', text: "Let's play some games!",
    motion: 'The character points enthusiastically with one paw, then jumps in place with arms up in excitement, big smile.' },
  { key: 'learn_intro', text: "Let's learn something new!",
    motion: 'The character taps its head with a paw as if thinking, then raises a paw with finger pointing up in a "lightbulb" gesture, eyes wide with curiosity.' },
  { key: 'art_intro',   text: "Let's make some art!",
    motion: 'The character mimes painting with one paw in the air, swaying side to side, looking creative and playful, paws moving like holding a paintbrush.' },
  { key: 'watch_intro', text: "Let's watch some videos!",
    motion: 'The character points forward with both paws as if at a TV, eyes wide and sparkling, head tilts with anticipation.' },
  { key: 'cheer_great', text: 'Great job, way to go!',
    motion: 'The character claps paws together quickly, jumps up and down with joy, huge celebrating smile.' },
  { key: 'cheer_didit', text: 'You did it, woohoo! Yes!',
    motion: 'The character throws both arms up in the air triumphantly, leans forward proudly, beaming celebration.' },
  { key: 'cheer_awesome', text: 'That is so awesome!',
    motion: 'The character points at the viewer with one paw and gives a thumbs-up with the other, big enthusiastic grin.' },
  { key: 'cheer_yay',   text: 'Yay! Hooray! Yay!',
    motion: 'The character jumps in place with arms raised, spins slightly, pure joy and excitement.' },
  { key: 'goodbye',     text: 'See you next time, bye-bye!',
    motion: 'The character waves one paw goodbye, blows a small kiss with the other, gentle smile and a slight bow.' },
];

const VOICES = {
  girl: process.env.EL_VOICE_GIRL || 'EXAVITQu4vr4xnSDxMaL', // Sarah
  boy:  process.env.EL_VOICE_BOY  || 'TX3LPaxmHKxFdv7VOQHJ', // Liam (was Josh - too deep)
};

// Pitch up all generated audio +3 semitones to sound more kid-like.
// 2^(3/12) ≈ 1.189 frequency multiplier.
const PITCH_RATIO = 1.189207;

// ───── helpers ──────────────────────────────────────────────────────────

function b64url(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function klingJWT() {
  const accessKey = process.env.KLING_ACCESS_KEY;
  const secretKey = process.env.KLING_SECRET_KEY;
  if (!accessKey || !secretKey) throw new Error('KLING_ACCESS_KEY / KLING_SECRET_KEY missing');
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(JSON.stringify({ iss: accessKey, exp: now + 1800, nbf: now - 5 }));
  const sig = b64url(crypto.createHmac('sha256', secretKey).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${sig}`;
}

async function genImage(prompt, outPath) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY missing');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict?key=${key}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: { sampleCount: 1, aspectRatio: '1:1' },
    }),
  });
  if (!res.ok) throw new Error(`Imagen ${res.status}: ${await res.text()}`);
  const json = await res.json();
  const b64 = json?.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) throw new Error('Imagen returned no image: ' + JSON.stringify(json).slice(0, 300));
  fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
  return outPath;
}

async function genVoice(text, voiceId, outPath) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ELEVENLABS_API_KEY missing');
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({
      text,
      model_id: 'eleven_turbo_v2_5',
      voice_settings: { stability: 0.55, similarity_boost: 0.75, style: 0.30 },
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  // Write raw audio, then pitch-shift in place via ffmpeg.
  const rawPath = outPath + '.raw.mp3';
  fs.writeFileSync(rawPath, Buffer.from(await res.arrayBuffer()));
  await new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', ['-y', '-i', rawPath, '-af',
      `asetrate=44100*${PITCH_RATIO},aresample=44100,atempo=1/${PITCH_RATIO}`,
      outPath]);
    ff.on('close', code => code === 0 ? resolve() : reject(new Error('ffmpeg exit ' + code)));
    ff.on('error', reject);
  });
  fs.unlinkSync(rawPath);
  return outPath;
}

async function replicateLipSync(imagePath, audioPath, outPath, motionPrompt) {
  // Wav2Lip via Replicate — works on cartoon faces (no human-detection requirement).
  const key = process.env.REPLICATE_API_TOKEN;
  if (!key) throw new Error('REPLICATE_API_TOKEN missing');

  // Look up the latest version of prunaai/p-video-avatar (works with cartoon faces).
  const modelRes = await fetch('https://api.replicate.com/v1/models/prunaai/p-video-avatar', {
    headers: { Authorization: `Token ${key}` },
  });
  if (!modelRes.ok) throw new Error(`Replicate model lookup ${modelRes.status}: ${await modelRes.text()}`);
  const versionId = (await modelRes.json())?.latest_version?.id;
  if (!versionId) throw new Error('No latest_version on prunaai/p-video-avatar');

  // Encode inputs as data URIs (Replicate accepts them up to a few MB).
  const imageB64 = fs.readFileSync(imagePath).toString('base64');
  const audioB64 = fs.readFileSync(audioPath).toString('base64');
  const faceUri = `data:image/png;base64,${imageB64}`;
  const audioUri = `data:audio/mpeg;base64,${audioB64}`;

  // Create prediction, retrying on 429 (Replicate rate-limits to 6/min while balance < $5).
  let prediction;
  for (let attempt = 1; attempt <= 6; attempt++) {
    const create = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: { Authorization: `Token ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        version: versionId,
        input: {
          image: faceUri,
          audio: audioUri,
          video_prompt: motionPrompt || 'The character is talking expressively with friendly gestures.',
          disable_prompt_upsampling: false,
        },
      }),
    });
    if (create.ok) { prediction = await create.json(); break; }
    if (create.status === 429) {
      const body = await create.json().catch(() => ({}));
      const wait = (body?.retry_after || 12) + 1;
      console.log(`\n  rate-limited, sleep ${wait}s (attempt ${attempt}/6)`);
      await new Promise(r => setTimeout(r, wait * 1000));
      continue;
    }
    throw new Error(`Replicate create ${create.status}: ${await create.text()}`);
  }
  if (!prediction) throw new Error('Replicate create: rate-limit retries exhausted');

  // Poll
  const start = Date.now();
  let result = prediction;
  while (result.status !== 'succeeded' && result.status !== 'failed' && result.status !== 'canceled') {
    if (Date.now() - start > 10 * 60 * 1000) throw new Error('Replicate timeout');
    await new Promise(r => setTimeout(r, 4000));
    const poll = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
      headers: { Authorization: `Token ${key}` },
    });
    if (!poll.ok) { console.warn(`  poll ${poll.status}`); continue; }
    result = await poll.json();
    process.stdout.write('.');
  }
  if (result.status !== 'succeeded') throw new Error('Replicate ' + result.status + ': ' + (result.error || ''));
  // Output may be a string URL or { video: url } depending on model
  const outputUrl = typeof result.output === 'string' ? result.output : (result.output?.video || result.output?.[0]);
  if (!outputUrl) throw new Error('Replicate no output: ' + JSON.stringify(result.output).slice(0, 200));
  const vid = await fetch(outputUrl);
  fs.writeFileSync(outPath, Buffer.from(await vid.arrayBuffer()));
  return outPath;
}

async function klingPoll(path, taskId) {
  const queryUrl = `https://api.klingai.com${path}/${taskId}`;
  const start = Date.now();
  while (Date.now() - start < 10 * 60 * 1000) {
    await new Promise(r => setTimeout(r, 6000));
    const q = await fetch(queryUrl, { headers: { Authorization: `Bearer ${klingJWT()}` } });
    if (!q.ok) { console.warn(`  poll ${q.status}: ${(await q.text()).slice(0,200)}`); continue; }
    const data = (await q.json())?.data;
    const status = data?.task_status;
    if (status === 'succeed') return data;
    if (status === 'failed') throw new Error('Kling failed: ' + JSON.stringify(data));
    process.stdout.write('.');
  }
  throw new Error('Kling timeout');
}

async function klingImage2Video(imagePath, prompt, outVidPath) {
  // One-time per mascot: generate the base 5s talking video.
  // Save both the local video and the Kling video_id (for later lip-sync).
  const imageB64 = fs.readFileSync(imagePath).toString('base64');
  const body = {
    model_name: 'kling-v1-6',
    mode: 'std',
    duration: '5',
    image: imageB64,
    prompt,
    cfg_scale: 0.5,
  };
  const res = await fetch('https://api.klingai.com/v1/videos/image2video', {
    method: 'POST',
    headers: { Authorization: `Bearer ${klingJWT()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Kling image2video ${res.status}: ${await res.text()}`);
  const created = await res.json();
  const taskId = created?.data?.task_id;
  if (!taskId) throw new Error('Kling no task_id: ' + JSON.stringify(created).slice(0, 300));
  const data = await klingPoll('/v1/videos/image2video', taskId);
  const videoId = data?.task_result?.videos?.[0]?.id;
  const videoUrl = data?.task_result?.videos?.[0]?.url;
  if (!videoId || !videoUrl) throw new Error('image2video no id/url: ' + JSON.stringify(data));
  const vid = await fetch(videoUrl);
  fs.writeFileSync(outVidPath, Buffer.from(await vid.arrayBuffer()));
  return { videoId, videoUrl };
}

async function klingLipSync(videoId, audioPath, outPath) {
  // Reuses a previously-generated Kling video by video_id.
  // Audio must be ≤5MB and 2-300s; we send as base64 file.
  const audioB64 = fs.readFileSync(audioPath).toString('base64');
  const body = {
    input: {
      mode: 'audio2video',
      video_id: videoId,
      audio_type: 'file',
      audio_file: audioB64,
    },
  };
  const res = await fetch('https://api.klingai.com/v1/videos/lip-sync', {
    method: 'POST',
    headers: { Authorization: `Bearer ${klingJWT()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Kling lip-sync ${res.status}: ${await res.text()}`);
  const created = await res.json();
  const taskId = created?.data?.task_id;
  if (!taskId) throw new Error('Kling no task_id: ' + JSON.stringify(created).slice(0, 300));
  const data = await klingPoll('/v1/videos/lip-sync', taskId);
  const videoUrl = data?.task_result?.videos?.[0]?.url;
  if (!videoUrl) throw new Error('lip-sync no URL: ' + JSON.stringify(data));
  const vid = await fetch(videoUrl);
  fs.writeFileSync(outPath, Buffer.from(await vid.arrayBuffer()));
  return outPath;
}

// Idle loop generation (Kling image-to-video, no audio, ~$0.20 per 5s std clip).
const IDLES = [
  { key: 'idle_wave',    prompt: 'The character waves one paw at the camera with a friendly smile, gentle swaying motion, looking happy and welcoming, idle pose, neutral background.' },
  { key: 'idle_bubbles', prompt: 'The character blows colorful soap bubbles from a small bubble wand, bubbles drift up around them, happy expression, gentle bobbing motion, idle pose.' },
  { key: 'idle_book',    prompt: 'The character holds an open colorful storybook in their paws, reading and occasionally looking up with a curious smile, peaceful idle motion.' },
  { key: 'idle_popcorn', prompt: 'The character holds a red-and-white striped popcorn bucket, eating popcorn one piece at a time with cheerful chewing motions, content and happy.' },
];

async function klingImage2VideoIdle(imagePath, prompt, outPath) {
  const imageB64 = fs.readFileSync(imagePath).toString('base64');
  const body = {
    model_name: 'kling-v1-6',
    mode: 'std',
    duration: '5',
    image: imageB64,
    prompt,
    cfg_scale: 0.5,
  };
  const res = await fetch('https://api.klingai.com/v1/videos/image2video', {
    method: 'POST',
    headers: { Authorization: `Bearer ${klingJWT()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Kling i2v ${res.status}: ${await res.text()}`);
  const taskId = (await res.json())?.data?.task_id;
  if (!taskId) throw new Error('no task_id');
  const data = await klingPoll('/v1/videos/image2video', taskId);
  const videoUrl = data?.task_result?.videos?.[0]?.url;
  if (!videoUrl) throw new Error('no video url');
  const tmpPath = outPath + '.fwd.mp4';
  const vid = await fetch(videoUrl);
  fs.writeFileSync(tmpPath, Buffer.from(await vid.arrayBuffer()));

  // Make seamless loop: concat forward + reverse via ffmpeg
  await new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', ['-y', '-i', tmpPath, '-filter_complex',
      '[0:v]reverse[r];[0:v][r]concat=n=2:v=1:a=0[v]', '-map', '[v]',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'fast', outPath]);
    ff.stderr.on('data', () => {}); // silence
    ff.on('close', code => code === 0 ? resolve() : reject(new Error('ffmpeg palindrome exit ' + code)));
  });
  fs.unlinkSync(tmpPath);
  return outPath;
}

// ───── main ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const mascotId = args[0];
const mode = args.find(a => a.startsWith('--'))?.slice(2) || 'image-only';

if (!mascotId || !MASCOTS[mascotId]) {
  console.error('Usage: node scripts/generate-mascot.mjs <mascot> [--image-only|--one-clip|--full]');
  console.error('Mascots: ' + Object.keys(MASCOTS).join(', '));
  process.exit(1);
}

const mascot = MASCOTS[mascotId];
const dir = path.join(ROOT, 'mascots', mascotId);
fs.mkdirSync(dir, { recursive: true });

console.log(`\n=== ${mascot.name} (${mode}) ===\n`);

const imagePath = path.join(dir, 'master.png');

// Image
if (!fs.existsSync(imagePath) || fs.statSync(imagePath).size < 1000) {
  console.log('→ generating master image (Gemini Imagen 3)...');
  await genImage(mascot.prompt, imagePath);
  console.log(`  saved ${imagePath} (${(fs.statSync(imagePath).size / 1024).toFixed(0)} KB)\n`);
} else {
  console.log(`✓ image exists: ${imagePath}\n`);
}

if (mode === 'image-only') {
  console.log(`Open it: ${imagePath}`);
  process.exit(0);
}

if (mode === 'idle') {
  // Generate idle loops only (no audio, no lip-sync)
  const idleDir = path.join(dir, 'idle');
  fs.mkdirSync(idleDir, { recursive: true });
  let done = 0, failed = 0;
  for (const idle of IDLES) {
    const outPath = path.join(idleDir, `${idle.key}.mp4`);
    if (fs.existsSync(outPath) && fs.statSync(outPath).size > 1000) {
      console.log(`✓ skip ${idle.key}`); done++; continue;
    }
    try {
      console.log(`→ [${idle.key}] generating idle loop...`);
      await klingImage2VideoIdle(imagePath, idle.prompt, outPath);
      console.log(`  ok (${(fs.statSync(outPath).size / 1024 / 1024).toFixed(1)} MB)`);
      done++;
    } catch (e) {
      console.error(`  ✗ ${e.message}`);
      failed++;
    }
  }
  console.log(`\n${done}/${IDLES.length} idle clips done, ${failed} failed.`);
  process.exit(failed > 0 ? 1 : 0);
}

// Step 2: Pick how many lip-sync clips to make (Wav2Lip on Replicate, no base video step needed)
const phrasesToRun = mode === 'one-clip' ? [PHRASES[0]] : PHRASES;
const voicesToRun  = mode === 'one-clip' ? ['girl'] : Object.keys(VOICES);

let done = 0, failed = 0;
const totalClips = phrasesToRun.length * voicesToRun.length;
const audioDir = path.join(dir, 'audio');
const videoDir = path.join(dir, 'video');
fs.mkdirSync(audioDir, { recursive: true });
fs.mkdirSync(videoDir, { recursive: true });

for (const voice of voicesToRun) {
  for (const p of phrasesToRun) {
    const audioPath = path.join(audioDir, `${voice}_${p.key}.mp3`);
    const videoPath = path.join(videoDir, `${voice}_${p.key}.mp4`);

    if (fs.existsSync(videoPath) && fs.statSync(videoPath).size > 1000) {
      console.log(`✓ skip ${voice}/${p.key} (already exists)`);
      done++; continue;
    }

    try {
      console.log(`→ [${voice}/${p.key}] "${p.text}"`);
      if (!fs.existsSync(audioPath)) {
        await genVoice(p.text, VOICES[voice], audioPath);
        console.log(`  voice ok`);
      }
      await replicateLipSync(imagePath, audioPath, videoPath, p.motion);
      console.log(`\n  video ok (${(fs.statSync(videoPath).size / 1024 / 1024).toFixed(1)} MB)`);
      done++;
    } catch (e) {
      console.error(`  ✗ ${e.message}`);
      failed++;
    }
  }
}

console.log(`\n${done}/${totalClips} done, ${failed} failed.`);
console.log(`Output in ${dir}/`);
