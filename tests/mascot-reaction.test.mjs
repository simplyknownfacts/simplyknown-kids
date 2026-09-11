import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
let server;
let browser;
let base;

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

before(async () => {
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['scripts/serve.mjs'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(base + '/__health.json')).ok) break;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  browser = await chromium.launch();
});

after(async () => {
  if (browser) await browser.close();
  if (server) server.kill();
});

async function fixture() {
  const page = await browser.newPage();
  await page.goto(base + '/__health.json');
  await page.setContent('<button id="companion" data-world-companion aria-label="Say hello"></button>');
  await page.evaluate(() => {
    window.rootPath = () => './';
    window.getActiveProfile = () => ({
      id: 'buddy-kid', voice: 'girl', mascot: { id: 'bunny', voice: 'girl' },
    });
    window.__media = [];
    window.__sounds = [];
    window.Audio = class {
      constructor(src) {
        this.src = src;
        this.volume = 1;
        this.onended = null;
        this.onerror = null;
        window.__sounds.push(this);
      }
      play() { return Promise.resolve(); }
      pause() { this.paused = true; }
    };
    HTMLMediaElement.prototype.load = function () {
      queueMicrotask(() => this.dispatchEvent(new Event('loadeddata')));
    };
    HTMLMediaElement.prototype.play = function () {
      window.__media.push(['play', this.src, this.muted]);
      queueMicrotask(() => this.dispatchEvent(new Event('playing')));
      return Promise.resolve();
    };
    HTMLMediaElement.prototype.pause = function () {
      window.__media.push(['pause', this.src, this.muted]);
    };
  });
  await page.addScriptTag({ url: base + '/js/mascot.js' });
  return page;
}

test('world companion reacts once with its selected audible clip and leaves clicks to its button', async () => {
  const page = await fixture();
  const result = await page.evaluate(async () => {
    mascot.show();
    await new Promise(requestAnimationFrame);
    const first = mascot.react();
    const mashed = mascot.react();
    await new Promise(resolve => setTimeout(resolve, 30));
    const sound = window.__sounds.at(-1);
    const src = sound && sound.src;
    const visual = [...document.querySelectorAll('#mascotWrap video')]
      .find(video => video.src.includes('welcome'));
    if (visual && visual.onended) visual.onended();
    const whileSoundPlays = mascot.react();
    if (sound && sound.onended) sound.onended();
    const afterEnd = mascot.react();
    return {
      first, mashed, whileSoundPlays, afterEnd, src,
      pointerEvents: getComputedStyle(document.getElementById('mascotWrap')).pointerEvents,
      parent: document.getElementById('mascotWrap').parentElement.id,
      soundCount: window.__sounds.length,
      audibleVideos: window.__media.filter(([kind, , muted]) => kind === 'play' && !muted).length,
    };
  });
  assert.equal(result.first, true);
  assert.equal(result.mashed, false, 'a second reaction started while the first clip was active');
  assert.equal(result.whileSoundPlays, false, 'the visual clip released while the animal sound was active');
  assert.equal(result.afterEnd, true, 'the reaction did not release when the clip ended');
  assert.match(result.src, /\/audio\/sounds\/rabbit\.mp3$/);
  assert.equal(result.soundCount, 2, 'a rapid tap created an extra animal sound');
  assert.equal(result.audibleVideos, 0, 'a mascot video produced random or duplicate audio');
  assert.equal(result.pointerEvents, 'none', 'the mascot overlay can intercept its outer button or scene clicks');
  assert.equal(result.parent, 'companion');
  await page.close();
});

test('failed reaction and pagehide both release safely for a later retry', async () => {
  const page = await fixture();
  const result = await page.evaluate(async () => {
    mascot.show();
    await new Promise(requestAnimationFrame);
    const first = mascot.react();
    await new Promise(resolve => setTimeout(resolve, 30));
    window.__sounds.at(-1).onerror();
    const afterError = mascot.react();
    await new Promise(resolve => setTimeout(resolve, 30));
    window.dispatchEvent(new PageTransitionEvent('pagehide'));
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    mascot.show();
    const afterPagehide = mascot.react();
    return { first, afterError, afterPagehide };
  });
  assert.deepEqual(result, { first: true, afterError: true, afterPagehide: true });
  await page.close();
});
