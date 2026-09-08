import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');

function offlineWorker(scope = 'https://kids.example/') {
  const listeners = new Map();
  const cached = new Map();
  const lookups = [];
  const self = {
    location: new URL('sw.js', scope),
    addEventListener(type, handler) { listeners.set(type, handler); },
  };
  vm.runInNewContext(source, {
    self, URL, console, importScripts() {},
    fetch: async () => { throw new TypeError('offline'); },
    caches: { match: async request => {
      const url = typeof request === 'string' ? request : request.url;
      lookups.push(url);
      return cached.get(url);
    } },
  });
  return {
    cached, lookups,
    async navigate(path, mode = 'navigate') {
      let response;
      listeners.get('fetch')({
        request: {url: new URL(path, scope).href, mode, destination: mode === 'navigate' ? 'document' : ''},
        respondWith(promise) { response = promise; }, waitUntil() {},
      });
      return response;
    },
  };
}

test('first offline Add child navigation uses the parent shell, including a deployed subdirectory', async () => {
  for (const scope of ['https://kids.example/', 'https://kids.example/app/']) {
    const worker = offlineWorker(scope);
    const page = {body: 'parent PIN and child setup'};
    worker.cached.set(new URL('parent/settings.html', scope).href, page);
    assert.equal(await worker.navigate('parent/settings.html?action=add'), page);
  }
});

test('a previously cached exact parent query takes precedence over the shell', async () => {
  const worker = offlineWorker();
  const exact = {body: 'exact page'};
  worker.cached.set('https://kids.example/parent/settings.html', {body: 'shell'});
  worker.cached.set('https://kids.example/parent/settings.html?action=add', exact);
  assert.equal(await worker.navigate('parent/settings.html?action=add'), exact);
  assert.equal(worker.lookups.length, 1);
});

test('offline parent fallback never strips query keys for other URLs or non-navigation requests', async () => {
  for (const [path, mode, canonical] of [
    ['home.html?action=add', 'navigate', 'https://kids.example/home.html'],
    ['css/parent-settings.css?v=next', 'cors', 'https://kids.example/css/parent-settings.css'],
    ['parent/settings.html?action=add', 'cors', 'https://kids.example/parent/settings.html'],
    ['https://elsewhere.example/parent/settings.html?action=add', 'navigate', 'https://elsewhere.example/parent/settings.html'],
  ]) {
    const worker = offlineWorker();
    worker.cached.set(canonical, {body: 'must not be substituted'});
    assert.equal(await worker.navigate(path, mode), undefined, path);
    assert.equal(worker.lookups.length, 1, path);
  }
});
