// The retired shared player must stay absent, while the local sleep timer keeps
// working across navigation and fades ordinary DOM media.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
let chromium = null;
try { ({ chromium } = await import('playwright')); } catch {}
const NEEDS_BROWSER = chromium ? false : 'playwright is not installed';

test('retired player is absent and local Listen routes keep the sleep timer', () => {
  const pages = execFileSync('git', ['ls-files', '--', '*.html'], { cwd: ROOT, encoding: 'utf8' })
    .split(/\r?\n/).filter(Boolean)
    .filter(rel => !/^(docs|tests|\.claude|\.worktrees)\//.test(rel));
  const retiredImports = pages.filter(rel =>
    /src=["'][^"']*js\/yoto-player\.js["']/.test(readFileSync(path.join(ROOT, rel), 'utf8')));
  assert.deepEqual(retiredImports, []);

  const listen = readFileSync(path.join(ROOT, 'listen/index.html'), 'utf8');
  const tune = readFileSync(path.join(ROOT, 'games/tap-a-tune.html'), 'utf8');
  assert.match(listen, /href="\.\.\/games\/tap-a-tune\.html"/);
  assert.match(listen, /src="\.\.\/js\/sleep-timer\.js"/);
  assert.match(tune, /src="\.\.\/js\/sleep-timer\.js"/);
});

let server = null;
let browser = null;
let BASE = '';

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function startServer(port) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'scripts', 'serve.mjs')], {
      cwd: ROOT,
      env: { ...process.env, PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const giveUp = setTimeout(() => reject(new Error('local server did not start')), 15000);
    child.stdout.on('data', data => {
      if (String(data).includes('localhost:' + port)) {
        clearTimeout(giveUp);
        resolve(child);
      }
    });
    child.once('error', error => {
      clearTimeout(giveUp);
      reject(error);
    });
  });
}

before(async () => {
  if (!chromium) return;
  const port = await freePort();
  BASE = 'http://127.0.0.1:' + port;
  server = await startServer(port);
  browser = await chromium.launch();
});

after(async () => {
  await browser?.close();
  server?.kill();
});

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

test('local DOM audio is faded after a Listen timer survives navigation',
  { skip: NEEDS_BROWSER, timeout: 35000 }, async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await context.route('**/*', route =>
      route.request().url().startsWith(BASE) || route.request().url().startsWith('data:')
        ? route.continue()
        : route.abort());
    await context.addInitScript(profile => {
      localStorage.setItem('vb_profiles', JSON.stringify([profile]));
      localStorage.setItem('vb_active_id', profile.id);
    }, {
      id: 'timer-test', name: 'Timer Test', birthday: '2020-01-01', color: '#7CC6FF',
      voice: 'woman', mascot: null, tierOverrides: {}, features: {}, activitiesVisible: {}, youtube: [],
    });

    const page = await context.newPage();
    page.setDefaultTimeout(6000);
    await page.goto(BASE + '/listen/index.html', { waitUntil: 'load' });
    assert.equal(await page.locator('#yotoMini, #yotoLaunch, #player, .card-tile').count(), 0);
    await page.locator('.sleep-btn[data-mins="5"]').click();
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('vb_sleep_timer')).minutes), 5);

    await page.locator('a[href="../games/tap-a-tune.html"]').click();
    await page.waitForURL('**/games/tap-a-tune.html');
    await page.evaluate(src => {
      const audio = document.createElement('audio');
      audio.id = 'localTimerAudio';
      audio.src = src;
      document.body.appendChild(audio);
      const start = document.createElement('button');
      start.id = 'startLocalAudio';
      start.textContent = 'Start test audio';
      start.style.cssText = 'position:fixed;z-index:2147483647;left:8px;top:8px;';
      start.addEventListener('click', () => audio.play());
      document.body.appendChild(start);
    }, silentWavDataUri(20));

    await page.locator('#startLocalAudio').click();
    await page.waitForFunction(() => !document.getElementById('localTimerAudio').paused);
    assert.equal(await page.evaluate(() => window.vbSleepTimer.minutes()), 5);
    await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem('vb_sleep_timer'));
      state.endsAt = Date.now() + 250;
      localStorage.setItem('vb_sleep_timer', JSON.stringify(state));
    });

    await page.waitForFunction(() => document.getElementById('localTimerAudio').paused, null, { timeout: 8000 });
    assert.equal(await page.evaluate(() => document.getElementById('localTimerAudio').volume), 1);
    assert.equal(await page.evaluate(() => localStorage.getItem('vb_sleep_timer')), null);
    assert.equal(await page.locator('#yotoMini, #yotoLaunch').count(), 0);
    await context.close();
  });
