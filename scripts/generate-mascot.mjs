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

// Load .env — this worktree first, then fall back to the main repo root
// (git worktrees don't get a copy of the gitignored .env).
for (const ENV_PATH of [path.join(ROOT, '.env'), path.resolve(ROOT, '../../../.env')]) {
  if (!fs.existsSync(ENV_PATH)) continue;
  for (const line of fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*"?([^"]*?)"?\s*$/);
    if (m) process.env[m[1]] ||= m[2];
  }
}

const MASCOTS = {
  dog:     { name: 'Dog',     prompt: 'a friendly black pit bull mutt puppy with white paws, a white chest, and a white muzzle with plenty of white around the nose, sitting upright, big expressive eyes, cute cartoon illustration, kids book style, a solid flat chroma-green (#00FF00) background, nothing else, full body visible, mouth slightly open in a happy smile' },
  tiger:   { name: 'Tiger',   prompt: 'a friendly cartoon tiger cub sitting upright, big expressive eyes, orange and black stripes, white chest and belly, a solid flat chroma-green (#00FF00) background, nothing else, kids book illustration style, full body visible, mouth slightly open in a happy smile' },
  giraffe: { name: 'Giraffe', prompt: 'a friendly cartoon baby giraffe standing upright, long neck visible, big expressive eyes, yellow and brown spots, a solid flat chroma-green (#00FF00) background, nothing else, kids book illustration style, full body visible, mouth slightly open in a happy smile' },
  panda:   { name: 'Panda',   prompt: 'a friendly cartoon baby panda sitting upright, big expressive eyes, classic black and white markings, a solid flat chroma-green (#00FF00) background, nothing else, kids book illustration style, full body visible, mouth slightly open in a happy smile' },
  orca:    { name: 'Orca',    prompt: 'a friendly cartoon baby orca whale, smiling, big expressive eyes, glossy black and white skin, a solid flat chroma-green (#00FF00) background, nothing else, kids book illustration style, body in playful pose, mouth slightly open showing a friendly smile' },
  eagle:   { name: 'Eagle',   prompt: 'a friendly cartoon bald eagle, big expressive eyes, white head, brown body, golden beak slightly open in a friendly smile, a solid flat chroma-green (#00FF00) background, nothing else, kids book illustration style, perched upright' },

  // ── 6 new (2 air, 2 water, 2 land) ──
  owl:     { name: 'Owl',     prompt: 'a friendly cartoon baby owl perched upright, big round expressive eyes, soft brown and cream feathers, small orange beak, little ear tufts, a solid flat chroma-green (#00FF00) background, nothing else, kids book illustration style, full body visible, happy friendly expression' },
  parrot:  { name: 'Parrot',  prompt: 'a friendly cartoon baby parrot perched upright, big expressive eyes, bright colorful feathers (red, blue, yellow and green), small curved beak, a solid flat chroma-green (#00FF00) background, nothing else, kids book illustration style, full body visible, cheerful smile' },
  dolphin: { name: 'Dolphin', prompt: 'a friendly cartoon baby dolphin, smiling, big expressive eyes, smooth blue-gray skin with a light belly, a solid flat chroma-green (#00FF00) background, nothing else, kids book illustration style, playful pose, mouth slightly open in a friendly smile' },
  octopus: { name: 'Octopus', prompt: 'a friendly cartoon baby octopus, big expressive eyes, round head and eight curly tentacles, soft purple and pink color, a solid flat chroma-green (#00FF00) background, nothing else, kids book illustration style, full body visible, happy curious smile' },
  lion:    { name: 'Lion',    prompt: 'a friendly cartoon lion cub sitting upright, big expressive eyes, golden fur with a small fuzzy mane, a solid flat chroma-green (#00FF00) background, nothing else, kids book illustration style, full body visible, happy friendly smile' },
  bunny:   { name: 'Bunny',   prompt: 'a friendly cartoon baby bunny rabbit sitting upright, big expressive eyes, long soft ears, fluffy white and gray fur, little pink nose, a solid flat chroma-green (#00FF00) background, nothing else, kids book illustration style, full body visible, sweet happy smile' },
  fox:     { name: 'Fox',     prompt: 'a friendly cartoon fox cub sitting upright, big expressive eyes, orange fur with a white chest and cheeks, fluffy white-tipped tail, dark little paws, a solid flat chroma-green (#00FF00) background, nothing else, kids book illustration style, full body visible, happy friendly smile' },
  penguin: { name: 'Penguin', prompt: 'a friendly cartoon baby penguin standing upright, big expressive eyes, classic black and white body, little orange beak and orange feet, a solid flat chroma-green (#00FF00) background, nothing else, kids book illustration style, full body visible, cheerful happy smile' },
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
  girl:  process.env.EL_VOICE_GIRL  || 'EXAVITQu4vr4xnSDxMaL', // Sarah  (kid, pitched up)
  boy:   process.env.EL_VOICE_BOY   || 'TX3LPaxmHKxFdv7VOQHJ', // Liam   (kid, pitched up)
  woman: process.env.EL_VOICE_WOMAN || '21m00Tcm4TlvDq8ikWAM', // Rachel (adult woman, no pitch)
  man:   process.env.EL_VOICE_MAN   || 'pNInz6obpgDQGcFmaJgB', // Adam   (adult man, no pitch)
};
// Only kid voices get the +3 semitone pitch-up; grown-up voices stay natural.
const KID_VOICES = new Set(['girl', 'boy']);

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

async function genVoice(text, voiceId, outPath, pitch = true) {
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
  const buf = Buffer.from(await res.arrayBuffer());
  // Kid voices get pitched up +3 semitones; grown-up voices are kept natural.
  if (!pitch) { fs.writeFileSync(outPath, buf); return outPath; }
  const rawPath = outPath + '.raw.mp3';
  fs.writeFileSync(rawPath, buf);
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
// Base resting clip per mascot — what they do when no action is playing.
// Subtle motion only: breathing, blinking, ears twitching. Loops continuously.
const BASE_IDLES = {
  dog:     { key: 'idle_base', prompt: 'The dog sits calmly in a resting pose, chest gently rising and falling with slow breathing, tongue hanging slightly out of mouth, blinking peacefully, occasional small ear twitch, very subtle minimal motion only, looking at camera.' },
  tiger:   { key: 'idle_base', prompt: 'The tiger cub sits calmly in resting pose, chest gently rising and falling with slow breathing, eyes blinking slowly, ears flicking occasionally, content peaceful expression, very subtle minimal motion only.' },
  giraffe: { key: 'idle_base', prompt: 'The giraffe stands calmly in resting pose, long neck still with the tiniest gentle sway, long eyelashes blinking softly, ears flicking occasionally, very subtle breathing motion only.' },
  panda:   { key: 'idle_base', prompt: 'The panda sits calmly in resting pose, chest gently breathing slowly, blinking softly, ears twitch once in a while, content and peaceful, very subtle minimal motion.' },
  orca:    { key: 'idle_base', prompt: 'The orca whale hovers in place with a gentle slow tail flick, body slightly rising and falling with calm breathing, eyes blinking slowly, subtle calm motion.' },
  eagle:   { key: 'idle_base', prompt: 'The eagle perches calmly on its branch, chest rising and falling with gentle breathing, head making tiny subtle turns, eyes blinking, very still and majestic, minimal motion only.' },
  owl:     { key: 'idle_base', prompt: 'The owl perches calmly, chest gently rising and falling with slow breathing, big round eyes blinking slowly, head making tiny subtle turns, ear tufts twitching occasionally, very subtle minimal motion only.' },
  parrot:  { key: 'idle_base', prompt: 'The parrot perches calmly, chest gently breathing, head tilting side to side with curious little movements, blinking, occasional small wing ruffle, very subtle minimal motion only.' },
  dolphin: { key: 'idle_base', prompt: 'The dolphin hovers in place with a gentle slow tail flick, body slightly rising and falling with calm breathing, eyes blinking slowly, subtle calm motion.' },
  octopus: { key: 'idle_base', prompt: 'The octopus hovers in place, eight tentacles gently curling and swaying, body softly pulsing with calm breathing, big eyes blinking slowly, subtle calm motion.' },
  lion:    { key: 'idle_base', prompt: 'The lion cub sits calmly in resting pose, chest gently rising and falling with breathing, blinking slowly, small ears flicking occasionally, content peaceful expression, very subtle minimal motion.' },
  bunny:   { key: 'idle_base', prompt: 'The bunny sits calmly, nose twitching softly, long ears giving the occasional gentle flop, chest breathing slowly, blinking, very subtle minimal motion only.' },
  fox:     { key: 'idle_base', prompt: 'The fox cub sits calmly in resting pose, chest gently rising and falling with breathing, blinking slowly, ears flicking and the fluffy tail giving the occasional gentle swish, very subtle minimal motion.' },
  penguin: { key: 'idle_base', prompt: 'The penguin stands calmly, body gently rocking side to side with slow breathing, blinking, little flippers twitching occasionally, very subtle minimal motion only.' },
};

const UNIVERSAL_IDLES = [
  { key: 'idle_wave',    prompt: 'The character waves one paw at the camera with a friendly smile, gentle swaying motion, looking happy and welcoming, idle pose, on a flat green background.' },
  { key: 'idle_bubbles', prompt: 'The character blows colorful soap bubbles from a small bubble wand, bubbles drift up around them, happy expression, gentle bobbing motion, idle pose.' },
  { key: 'idle_book',    prompt: 'The character sits upright and lifts its two front paws to hold an open colorful storybook against its chest, looking down at the pages then glancing up with a curious happy smile. The book is clearly visible and held by the two front paws. Keep natural anatomy — four legs only, no duplicated or extra paws/arms/hands.' },
  { key: 'idle_popcorn', prompt: 'The character holds a red-and-white striped popcorn bucket, eating popcorn one piece at a time with cheerful chewing motions, content and happy.' },
];

const SPECIES_IDLES = {
  dog: [
    { key: 'idle_tail',   prompt: 'The dog spins in a quick playful circle chasing its own tail, tongue out, having fun, then settles back to sit, looping motion.' },
    { key: 'idle_scratch', prompt: 'The dog scratches behind its ear with one back paw, head tilted, eyes squinting happily, classic dog scratching motion.' },
    { key: 'idle_sniff',  prompt: 'The dog sniffs the air curiously, nose twitching, ears perking up, head turning side to side as if smelling something interesting.' },
    { key: 'idle_pant',   prompt: 'The dog sits and pants happily with tongue hanging out, tail wagging visibly, panting motion of the chest and tongue.' },
  ],
  tiger: [
    { key: 'idle_yawn',    prompt: 'The tiger opens its mouth in a big slow yawn showing whiskers and tongue, then closes mouth and blinks sleepily, cute lazy moment.' },
    { key: 'idle_stretch', prompt: 'The tiger stretches forward like a cat, front paws extending, back arching, then relaxes back to sitting pose, satisfied expression.' },
    { key: 'idle_lick',    prompt: 'The tiger licks one of its front paws with a small pink tongue and rubs it over its face like a cat grooming itself, cute motion.' },
    { key: 'idle_prowl',   prompt: 'The tiger does a slow playful prowl in place, low to the ground, shoulders shifting, looking at the camera mischievously.' },
  ],
  giraffe: [
    { key: 'idle_bend',     prompt: 'The giraffe bends its long neck down toward the ground curiously, then slowly raises it back up to look at the camera, gentle motion.' },
    { key: 'idle_leaves',   prompt: 'The giraffe reaches up high with its long neck as if eating leaves from a tall tree, chewing happily, then looks at the camera.' },
    { key: 'idle_eyelash',  prompt: 'The giraffe blinks slowly with its long eyelashes, head tilted slightly, sweet innocent expression, then a small playful smile.' },
    { key: 'idle_sway',     prompt: 'The giraffe sways its long neck gently side to side like dancing to a slow rhythm, eyes closed peacefully, body bobbing.' },
  ],
  panda: [
    { key: 'idle_bamboo',  prompt: 'The panda holds a green bamboo stalk in its paws and munches on it happily, leaves visible, cheerful chewing motion.' },
    { key: 'idle_roll',    prompt: 'The panda rolls onto its back playfully, paws up in the air, then rights itself again, classic panda tumble.' },
    { key: 'idle_hug',     prompt: 'The panda hugs itself with both paws across its chest, gentle rocking motion, eyes squeezed happily shut in a self-hug.' },
    { key: 'idle_somer',   prompt: 'The panda does a small somersault forward in place, tumbling cute and playful, then sits back up grinning.' },
  ],
  orca: [
    { key: 'idle_flip',   prompt: 'The orca whale flips its tail and does a quick rolling spin in place, then settles back to a gentle hover, playful motion.' },
    { key: 'idle_breach', prompt: 'The orca leaps up in a playful arc then settles back down in place, happy and bouncy.' },
    { key: 'idle_splash', prompt: 'The orca flicks its tail fin playfully and bobs gently with a happy expression.' },
    { key: 'idle_swim',   prompt: 'The orca glides in a slow gentle circle in place, fins moving smoothly, peaceful motion.' },
  ],
  eagle: [
    { key: 'idle_flap',   prompt: 'The eagle stretches and flaps its large wings open and closed a few times, feathers spreading, then folds them back, majestic motion.' },
    { key: 'idle_preen',  prompt: 'The eagle turns its head and uses its golden beak to preen the feathers on its shoulder and chest, careful grooming motion.' },
    { key: 'idle_alert',  prompt: 'The eagle turns its head sharply side to side looking around alertly, sharp eyes scanning, feathers ruffling slightly.' },
    { key: 'idle_call',   prompt: 'The eagle opens its beak and lets out a small screech call, head tipped back slightly, chest puffing, throat moving with the sound.' },
  ],
  owl: [
    { key: 'idle_hoot',     prompt: 'The owl opens its small beak for a little hoot, chest puffing gently, big eyes wide, friendly expression, then settles back.' },
    { key: 'idle_headturn', prompt: 'The owl slowly rotates its head far to one side curiously like only an owl can, then back to center, big blinking eyes.' },
    { key: 'idle_fluff',    prompt: 'The owl puffs up and fluffs all its feathers for a moment then settles them back down smooth, cute shiver motion.' },
    { key: 'idle_peek',     prompt: 'The owl playfully covers its eyes with one wing, then peeks out from behind it with a happy little smile.' },
  ],
  parrot: [
    { key: 'idle_squawk', prompt: 'The parrot opens its curved beak for a happy little squawk, head bobbing, colorful feathers ruffling, cheerful motion.' },
    { key: 'idle_dance',  prompt: 'The parrot bobs its head up and down and steps side to side dancing on its perch, swaying happily to a beat.' },
    { key: 'idle_preen',  prompt: 'The parrot turns its head and preens its colorful wing feathers with its beak, careful tidy grooming motion.' },
    { key: 'idle_flap',   prompt: 'The parrot opens and flaps its bright wings a few times showing off the colors, then folds them back neatly.' },
  ],
  dolphin: [
    { key: 'idle_jump',  prompt: 'The dolphin leaps up in a graceful arc and gently arcs back down in place, playful motion.' },
    { key: 'idle_spin',  prompt: 'The dolphin does a quick happy spin in place, then settles back to a gentle hover.' },
    { key: 'idle_click', prompt: 'The dolphin nods its head and opens its mouth making cheerful clicking and chittering motions, friendly and chatty.' },
    { key: 'idle_swim',  prompt: 'The dolphin glides in a slow gentle circle in place, fins moving smoothly, peaceful motion.' },
  ],
  octopus: [
    { key: 'idle_wiggle',     prompt: 'The octopus wiggles all eight tentacles playfully one after another like a happy little wave, big smiling eyes.' },
    { key: 'idle_squirt',     prompt: 'The octopus playfully bobs upward a little then drifts back down, tentacles fluttering, happy expression.' },
    { key: 'idle_curl',       prompt: 'The octopus curls all its tentacles in to make a round ball shape, then slowly unfurls them again, cute motion.' },
    { key: 'idle_colorshift', prompt: 'The octopus softly shifts its color through gentle pastel hues like a happy octopus, tentacles swaying calmly.' },
  ],
  lion: [
    { key: 'idle_roar',    prompt: 'The lion cub opens its mouth in a tiny cute roar, little mane ruffling, then closes its mouth with a proud happy grin.' },
    { key: 'idle_stretch', prompt: 'The lion cub stretches forward like a big cat, front paws extending and back arching, then relaxes back to sitting.' },
    { key: 'idle_lick',    prompt: 'The lion cub licks one front paw and rubs it over its face grooming itself like a cat, cute careful motion.' },
    { key: 'idle_pounce',  prompt: 'The lion cub crouches low and does a small playful pounce forward in place, then sits back up looking pleased.' },
  ],
  bunny: [
    { key: 'idle_hop',     prompt: 'The bunny does a small happy hop in place, ears bouncing, then settles back down with a sweet expression.' },
    { key: 'idle_munch',   prompt: 'The bunny holds a leafy orange carrot in its paws and munches on it happily with quick little nibbles, content motion.' },
    { key: 'idle_earwash', prompt: 'The bunny pulls one long ear down with its paws and washes it, then lets it spring back up, cute grooming motion.' },
    { key: 'idle_thump',   prompt: 'The bunny thumps a back foot a couple of times then perks its ears up alert and curious, playful motion.' },
  ],
  fox: [
    { key: 'idle_pounce',  prompt: 'The fox cub crouches low and does a small playful pounce forward in place, then sits back up looking pleased.' },
    { key: 'idle_tailwrap',prompt: 'The fox cub curls its fluffy tail around itself cozily, then settles with a content little smile.' },
    { key: 'idle_sniff',   prompt: 'The fox cub sniffs the air curiously, nose twitching, ears perking up and turning side to side.' },
    { key: 'idle_tilt',    prompt: 'The fox cub tilts its head curiously from side to side, big eyes blinking, sweet inquisitive expression.' },
  ],
  penguin: [
    { key: 'idle_waddle', prompt: 'The penguin takes a couple of cute waddling steps in place, flippers out for balance, happy expression.' },
    { key: 'idle_flap',   prompt: 'The penguin flaps its little flippers quickly with excitement, bobbing up and down, joyful motion.' },
    { key: 'idle_slide',  prompt: 'The penguin flops onto its belly and does a short happy slide in place, then pops back up grinning.' },
    { key: 'idle_preen',  prompt: 'The penguin turns its head and preens its chest feathers with its little beak, tidy grooming motion.' },
  ],
};

function _idleSetFor(mascotId) {
  const base = BASE_IDLES[mascotId] ? [BASE_IDLES[mascotId]] : [];
  return [...base, ...UNIVERSAL_IDLES, ...(SPECIES_IDLES[mascotId] || [])];
}

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
const outArg = args.find(a => a.startsWith('--out='));
const mode = args.find(a => a.startsWith('--') && !a.startsWith('--out='))?.slice(2) || 'image-only';

if (!mascotId || !MASCOTS[mascotId]) {
  console.error('Usage: node scripts/generate-mascot.mjs <mascot> [--image-only|--one-clip|--full]');
  console.error('Mascots: ' + Object.keys(MASCOTS).join(', '));
  process.exit(1);
}

const mascot = MASCOTS[mascotId];
const dir = outArg ? path.resolve(ROOT, outArg.slice('--out='.length)) : path.join(ROOT, 'mascots', mascotId);
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
  // Optional --idles=key1,key2 filter (e.g. test just idle_base before the full set).
  const idlesArg = args.find(a => a.startsWith('--idles='));
  const onlyIdles = idlesArg ? idlesArg.slice('--idles='.length).split(',') : null;
  const idleSet = _idleSetFor(mascotId).filter(i => !onlyIdles || onlyIdles.includes(i.key));
  for (const idle of idleSet) {
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
  console.log(`\n${done}/${idleSet.length} idle clips done, ${failed} failed.`);
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
        await genVoice(p.text, VOICES[voice], audioPath, KID_VOICES.has(voice));
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
