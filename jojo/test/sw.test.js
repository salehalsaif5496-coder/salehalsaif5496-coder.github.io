/* jojo/sw.js بدون متصفح: نشغله بـ vm مع self وهمي، ونشوف أي طلبات يرد عليها (respondWith) وأيها يتركها للشبكة. */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadSW(scope) {
  const listeners = {};
  const self = {
    location: new URL(scope + 'sw.js?v=t'),
    registration: { scope },
    addEventListener: (t, fn) => { listeners[t] = fn; },
    skipWaiting: () => Promise.resolve(),
    clients: { claim: () => Promise.resolve(), matchAll: () => Promise.resolve([]), openWindow: () => Promise.resolve() }
  };
  const ctx = { self, URL, Promise, setTimeout, clearTimeout, caches: { open: () => new Promise(() => {}), match: () => new Promise(() => {}), keys: () => Promise.resolve([]) },
    fetch: () => new Promise(() => {}), Response: { error: () => null }, Request: function () {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8'), ctx);
  return { listeners, ctx };
}
function handled(sw, url, mode) {
  let responded = false;
  sw.listeners.fetch({ request: { url, method: 'GET', mode: mode || 'navigate' }, respondWith: () => { responded = true; } });
  return responded;
}

test('sw: never touches Saleh\'s page — with and without slash, query, hash, sub-files', () => {
  const sw = loadSW('https://x.github.io/jojo/');
  for (const u of [
    'https://x.github.io/jojo/saleh', 'https://x.github.io/jojo/saleh/', 'https://x.github.io/jojo/saleh?demo=1',
    'https://x.github.io/jojo/saleh#home', 'https://x.github.io/jojo/saleh/?demo=1#taste', 'https://x.github.io/jojo/saleh/index.html',
    'https://x.github.io/jojo/saleh/manifest.webmanifest'
  ]) assert.strictEqual(handled(sw, u), false, u);
});

test('sw: still serves Jojo\'s own pages and files', () => {
  const sw = loadSW('https://x.github.io/jojo/');
  for (const u of ['https://x.github.io/jojo/', 'https://x.github.io/jojo/index.html', 'https://x.github.io/jojo/salehx', 'https://x.github.io/jojo/core.js?v=1'])
    assert.strictEqual(handled(sw, u), true, u);
  assert.strictEqual(handled(sw, 'https://x.github.io/jojo/fonts/a.woff2', 'no-cors'), true);
});

test('sw: notification click never focuses Saleh\'s page', async () => {
  const sw = loadSW('https://x.github.io/jojo/');
  let focused = null, opened = null;
  const win = (url) => ({ url, focus() { focused = url; return Promise.resolve(null); } });
  sw.ctx.self.clients.matchAll = () => Promise.resolve([win('https://x.github.io/jojo/saleh'), win('https://x.github.io/jojo/saleh/?demo=1')]);
  sw.ctx.self.clients.openWindow = (u) => { opened = u; return Promise.resolve(); };
  let p;
  sw.listeners.notificationclick({ notification: { close() {}, data: { url: './#today' } }, waitUntil: (x) => { p = x; } });
  await p;
  assert.strictEqual(focused, null);
  assert.strictEqual(opened, 'https://x.github.io/jojo/#today');
});
