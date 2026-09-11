// Watch owns at most one player-opening attempt. Closing or replacing an
// attempt must invalidate every continuation still waiting on the feed or the
// YouTube API, without allowing stale cleanup to touch a newer player.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve(import.meta.dirname, '..');
let server, browser, BASE;

async function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function waitFor(getValue, message) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const value = getValue();
    if (value) return value;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error(message);
}

before(async () => {
  const port = await freePort();
  BASE = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['scripts/serve.mjs'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch(BASE + '/__health.json');
      if (response.ok && (await response.json()).app === 'kids') break;
    } catch {}
    if (attempt === 99) throw new Error('Kids test server did not start');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch();
});

after(async () => {
  if (browser) await browser.close();
  if (server) server.kill();
});

const YT_STUB = `
window.__watchPlayers=[];
window.YT={PlayerState:{ENDED:0},Player:class{
  constructor(target,options){
    this.target=target;this.options=options;this.videoId=options.videoId;
    this.loaded=[options.videoId];this.stopped=0;this.destroyed=0;
    window.__watchPlayers.push(this);
  }
  loadVideoById(id){this.videoId=id;this.loaded.push(id);}
  stopVideo(){this.stopped++;}
  destroy(){this.destroyed++;}
}};
if(window.onYouTubeIframeAPIReady)window.onYouTubeIframeAPIReady();`;

function makePendingRequest(route) {
  let settled = false;
  return {
    succeed(videos = ['video-a']) {
      assert.equal(settled, false, 'feed request already settled');
      settled = true;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ videos: videos.map(id => ({ id })) }),
      });
    },
    fail() {
      assert.equal(settled, false, 'feed request already settled');
      settled = true;
      return route.abort('failed');
    },
  };
}

async function openWatch({ channelCount = 1, holdApi = false } = {}) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    serviceWorkers: 'block',
  });
  const feeds = [];
  let apiRequest = null;
  await context.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(BASE)) return route.continue();
    if (url.includes('/yt-feed')) {
      return new Promise(resolve => {
        const pending = makePendingRequest(route);
        feeds.push({
          succeed: videos => resolve(pending.succeed(videos)),
          fail: () => resolve(pending.fail()),
        });
      });
    }
    if (url === 'https://www.youtube.com/iframe_api') {
      if (!holdApi) {
        return route.fulfill({ status: 200, contentType: 'text/javascript', body: YT_STUB });
      }
      return new Promise(resolve => {
        apiRequest = {
          succeed: () => resolve(route.fulfill({ status: 200, contentType: 'text/javascript', body: YT_STUB })),
          fail: () => resolve(route.abort('failed')),
        };
      });
    }
    return route.abort('blockedbyclient');
  });
  await context.addInitScript(count => {
    const date = new Date();
    date.setFullYear(date.getFullYear() - 4);
    const youtube = Array.from({ length: count }, (_, index) => ({
      emoji: '📺',
      label: `Channel ${index + 1}`,
      channelId: `UC_TEST_${index + 1}`,
    }));
    const profile = {
      id: 'watch-lifecycle-kid', name: 'Testy', birthday: date.toISOString().slice(0, 10),
      color: '#7CC6FF', voice: 'woman', mascot: null, tierOverrides: {}, features: {}, youtube,
    };
    localStorage.setItem('vb_profiles', JSON.stringify([profile]));
    localStorage.setItem('vb_active_id', profile.id);
  }, channelCount);
  const page = await context.newPage();
  await page.goto(BASE + '/videos/index.html', { waitUntil: 'domcontentloaded' });
  await page.locator('.channel-tile').first().waitFor();
  return {
    context,
    page,
    feeds,
    nextFeed: index => waitFor(() => feeds[index], `feed request ${index + 1} did not arrive`),
    api: () => waitFor(() => apiRequest, 'YouTube API request did not arrive'),
  };
}

async function playerSnapshot(page) {
  return page.evaluate(() => ({
    active: document.querySelector('#playerWrap').classList.contains('active'),
    host: document.querySelector('#playerHost').textContent.trim(),
    target: !!document.querySelector('#ytTarget'),
    players: (window.__watchPlayers || []).map(player => ({
      videoId: player.videoId,
      loaded: [...player.loaded],
      stopped: player.stopped,
      destroyed: player.destroyed,
    })),
  }));
}

test('Back during a pending feed cannot create a hidden player', { timeout: 30000 }, async () => {
  const run = await openWatch();
  await run.page.locator('.channel-tile').first().click();
  const feed = await run.nextFeed(0);
  await run.page.locator('#playerBack').click();
  await feed.succeed(['feed-late']);
  await run.page.waitForTimeout(100);
  assert.deepEqual(await playerSnapshot(run.page), { active: false, host: '', target: false, players: [] });
  await run.context.close();
});

test('Back during YouTube API readiness cannot create a hidden player', { timeout: 30000 }, async () => {
  const run = await openWatch({ holdApi: true });
  const api = await run.api();
  await run.page.locator('.channel-tile').first().click();
  await (await run.nextFeed(0)).succeed(['api-late']);
  await run.page.waitForFunction(() => !!document.querySelector('#ytTarget'));
  await run.page.locator('#playerBack').click();
  await api.succeed();
  await run.page.waitForTimeout(100);
  assert.deepEqual(await playerSnapshot(run.page), { active: false, host: '', target: false, players: [] });
  await run.context.close();
});

test('a late rejected feed cannot write into a player that was closed', { timeout: 30000 }, async () => {
  const run = await openWatch();
  await run.page.locator('.channel-tile').first().click();
  const feed = await run.nextFeed(0);
  await run.page.locator('#playerBack').click();
  await feed.fail();
  await run.page.waitForTimeout(100);
  const snapshot = await playerSnapshot(run.page);
  assert.equal(snapshot.active, false);
  assert.equal(snapshot.host, '');
  assert.deepEqual(snapshot.players, []);
  await run.context.close();
});

test('a stale channel response cannot replace or destroy a newer player', { timeout: 30000 }, async () => {
  const run = await openWatch({ channelCount: 2 });
  await run.page.locator('.channel-tile').nth(0).click();
  const oldFeed = await run.nextFeed(0);
  await run.page.locator('.channel-tile').nth(1).evaluate(button => button.click());
  await (await run.nextFeed(1)).succeed(['new-channel']);
  await run.page.waitForFunction(() => window.__watchPlayers?.length === 1);
  await oldFeed.succeed(['old-channel']);
  await run.page.waitForTimeout(100);
  assert.deepEqual((await playerSnapshot(run.page)).players, [
    { videoId: 'new-channel', loaded: ['new-channel'], stopped: 0, destroyed: 0 },
  ]);
  await run.context.close();
});

test('close then reopen keeps the reopened player when the closed request resolves', { timeout: 30000 }, async () => {
  const run = await openWatch({ channelCount: 2 });
  await run.page.locator('.channel-tile').nth(0).click();
  const closedFeed = await run.nextFeed(0);
  await run.page.locator('#playerBack').click();
  await run.page.locator('.channel-tile').nth(1).click();
  await (await run.nextFeed(1)).succeed(['reopened-channel']);
  await run.page.waitForFunction(() => window.__watchPlayers?.length === 1);
  await closedFeed.succeed(['closed-channel']);
  await run.page.waitForTimeout(100);
  const snapshot = await playerSnapshot(run.page);
  assert.equal(snapshot.active, true);
  assert.deepEqual(snapshot.players, [
    { videoId: 'reopened-channel', loaded: ['reopened-channel'], stopped: 0, destroyed: 0 },
  ]);
  await run.context.close();
});

test('repeated Back calls invalidate one pending open and stay idempotent', { timeout: 30000 }, async () => {
  const run = await openWatch();
  await run.page.locator('.channel-tile').first().click();
  const feed = await run.nextFeed(0);
  await run.page.evaluate(() => {
    const back = document.querySelector('#playerBack');
    back.click(); back.click(); back.click();
  });
  await feed.succeed(['repeat-back-late']);
  await run.page.waitForTimeout(100);
  assert.deepEqual(await playerSnapshot(run.page), { active: false, host: '', target: false, players: [] });
  await run.context.close();
});

test('a failed feed can be closed and retried successfully', { timeout: 30000 }, async () => {
  const run = await openWatch();
  await run.page.locator('.channel-tile').first().click();
  await (await run.nextFeed(0)).fail();
  await run.page.getByText("Couldn't load shows right now.").waitFor();
  await run.page.locator('#playerBack').click();
  await run.page.locator('.channel-tile').first().click();
  await (await run.nextFeed(1)).succeed(['recovered']);
  await run.page.waitForFunction(() => window.__watchPlayers?.length === 1);
  assert.equal((await playerSnapshot(run.page)).players[0].videoId, 'recovered');
  await run.context.close();
});

test('normal queue progression and Back controls remain unchanged', { timeout: 30000 }, async () => {
  const run = await openWatch();
  await run.page.locator('.channel-tile').first().click();
  await (await run.nextFeed(0)).succeed(['queue-a', 'queue-b']);
  await run.page.waitForFunction(() => window.__watchPlayers?.length === 1);
  await run.page.evaluate(() => {
    const player = window.__watchPlayers[0];
    player.options.events.onStateChange({ data: window.YT.PlayerState.ENDED });
  });
  assert.deepEqual((await playerSnapshot(run.page)).players[0].loaded, ['queue-a', 'queue-b']);
  await run.page.locator('#playerBack').click();
  await run.page.evaluate(() => {
    const back = document.querySelector('#playerBack');
    back.click(); back.click();
  });
  assert.deepEqual((await playerSnapshot(run.page)).players, [
    { videoId: 'queue-b', loaded: ['queue-a', 'queue-b'], stopped: 1, destroyed: 1 },
  ]);
  await run.context.close();
});
