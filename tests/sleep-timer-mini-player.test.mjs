// Codex 0901-9, MED. Two real gaps, same root cause:
// (1) js/sleep-timer.js (the Listening Hut sleep timer -- fades music out at a
//     wall-clock deadline, TICK_MS + KEY vb_sleep_timer) is only ever loaded by
//     listen/index.html. Every OTHER page that carries the shared Yoto
//     mini-player (js/yoto-player.js, home + every section hub + every
//     activity) never loads it at all -- window.vbSleepTimer simply does not
//     exist there, so a timer set on Listen and then navigated away from (the
//     whole point of a mini-player) silently keeps playing forever.
// (2) Even where it WOULD exist, js/yoto-player.js's mini-player builds its own
//     `new Audio()` (a detached element -- js/sleep-timer.js's own top comment
//     says exactly this: "Detached `new Audio()` elements ... are invisible to
//     querySelectorAll, so they can only be faded if the page registers them")
//     and never calls window.vbSleepTimer.register() on it.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

// The browser import happens here, ABOVE the first test(), on purpose: node:test
// fires this file's after() hook as soon as every test registered so far has
// finished, and that hook is one-shot. With the static test above and this
// await below it, after() fired while the file was still paused here -- before
// the server and browser even existed -- and never again, so both outlived the
// run and the runner hung for ever (2026-09-06, every run). Guarded by
// tests/top-level-await-order.test.mjs.
let chromium = null;
try { ({ chromium } = await import('playwright')); } catch { /* handled below */ }
const NEEDS_BROWSER = chromium ? false :
  'playwright is not installed. Install it and these checks run: ' +
  'npm i playwright --no-save && npx playwright install chromium-headless-shell';

// ── static wiring check: no browser needed, always runs ─────────────────────
test('every page that loads js/yoto-player.js (the mini-player) also loads js/sleep-timer.js', () => {
  const tracked = execFileSync('git', ['ls-files', '--', '*.html'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n').filter(Boolean)
    .filter((rel) => !rel.startsWith('.worktrees/') && !rel.startsWith('.claude/'));
  const offenders = [];
  for (const rel of tracked) {
    const html = readFileSync(path.join(ROOT, rel), 'utf8');
    if (!/src=["'][^"']*js\/yoto-player\.js["']/.test(html)) continue; // no mini-player here
    if (/src=["'][^"']*js\/sleep-timer\.js["']/.test(html)) continue;  // already wired
    offenders.push(rel);
  }
  assert.deepEqual(offenders, [],
    'these pages load the Yoto mini-player but never load js/sleep-timer.js, so ' +
    'window.vbSleepTimer does not exist there and a timer set on Listen keeps ' +
    'playing forever once the family navigates away: ' + offenders.join(', '));
});

// ── real browser proof: the fade actually reaches the mini-player's audio ───
let server = null, browser = null, BASE = '';

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => resolve(port)); });
  });
}
function startServer(port) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'scripts', 'serve.mjs')], {
      env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'],
    });
    const giveUp = setTimeout(() => reject(new Error('scripts/serve.mjs did not come up within 15s')), 15000);
    child.stdout.on('data', (d) => { if (String(d).includes('localhost:' + port)) { clearTimeout(giveUp); resolve(child); } });
    child.once('error', (e) => { clearTimeout(giveUp); reject(e); });
    child.once('exit', (c) => { clearTimeout(giveUp); reject(new Error('the server exited early, code ' + c)); });
  });
}

before(async () => {
  if (!chromium) return;
  const port = await freePort();
  BASE = 'http://localhost:' + port;
  server = await startServer(port);
  browser = await chromium.launch();
});
after(async () => {
  if (browser) await browser.close();
  if (server) server.kill();
});

function seedProfile() {
  return {
    id: 'p1', name: 'Test', birthday: '2020-01-01', color: '#7CC6FF',
    voice: 'woman', mascot: null, tierOverrides: {}, features: {}, youtube: [],
  };
}

// A real audio FILE in this repo (the pre-generated voice clips) is a 1-2s
// name greeting -- too short: it finishes and fires 'ended' (which clears the
// whole mini-player, for an unrelated, correct reason) before there is time
// to watch the sleep timer's 4s fade. A synthetic silent WAV of a known,
// generous length sidesteps that without depending on any specific asset's
// runtime -- 8-bit PCM, mono, so "silence" is just the byte 128 repeated.
function silentWavDataUri(seconds) {
  const sampleRate = 8000;
  const dataSize = sampleRate * seconds;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate, 28);
  buf.writeUInt16LE(1, 32);
  buf.writeUInt16LE(8, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataSize, 40);
  buf.fill(128, 44);
  return 'data:audio/wav;base64,' + buf.toString('base64');
}

test('the Yoto mini-player audio survives navigation and still gets faded out by the sleep timer',
  { skip: NEEDS_BROWSER }, async () => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(({ p, src }) => {
      try {
        localStorage.setItem('vb_profiles', JSON.stringify([p]));
        localStorage.setItem('vb_active_id', p.id);
        // vb_yoto_now_playing is sessionStorage (js/yoto-player.js's KEY) --
        // actually playing, so a genuine 'pause' event (not "it just never
        // started") is what proves the fix, not a coincidence.
        sessionStorage.setItem('vb_yoto_now_playing', JSON.stringify({
          src, position: 0, playing: false, title: 'Test tape', cover: null,
        }));
      } catch {}
    }, { p: seedProfile(), src: silentWavDataUri(20) });
    const page = await ctx.newPage();
    // A hub page, deliberately NOT listen/index.html -- the whole point of a
    // mini-player is surviving navigation AWAY from Listen.
    await page.goto(BASE + '/home.html', { waitUntil: 'load' });
    await page.waitForSelector('#yotoMini');

    // A real click (a genuine user gesture) so autoplay policy actually lets
    // playback start -- otherwise "still paused after the timer" would be
    // true whether or not the fix works.
    await page.click('#ymPP');
    await page.waitForFunction(() => document.querySelector('#ymPP')?.textContent === '⏸', null, { timeout: 5000 });

    await page.evaluate(() => {
      // The real public API (arms sleep-timer.js's own tick interval), then
      // fast-forward the wall-clock deadline it stores to "almost up" --
      // simulating time passing, not a different code path.
      window.vbSleepTimer.set(5);
      const state = JSON.parse(localStorage.getItem('vb_sleep_timer'));
      state.endsAt = Date.now() + 300;
      localStorage.setItem('vb_sleep_timer', JSON.stringify(state));
    });

    // tick() runs once a second and re-reads storage; once it sees the
    // deadline has passed it fades over sleep-timer.js's own FADE_MS (4000ms)
    // and then pauses -- allow both, plus slack.
    await page.waitForFunction(() => document.querySelector('#ymPP')?.textContent === '▶', null, { timeout: 8000 });

    await ctx.close();
  });
