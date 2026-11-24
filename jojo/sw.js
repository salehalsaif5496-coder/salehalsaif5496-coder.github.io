/* جوجو — Service Worker: يخزن واجهة التطبيق عشان يفتح بدون نت.
   طلبات Supabase ما تنخزن أبد (بيانات شخصية + الطابور المحلي يتكفل بالتأشير بدون نت). */
var VERSION = 'jojo-shell-v1';
var SHELL = [
  './', './index.html', './core.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png',
  './fonts/baloo-bhaijaan-2-arabic-600-normal.woff2',
  './fonts/baloo-bhaijaan-2-arabic-700-normal.woff2',
  './fonts/baloo-bhaijaan-2-arabic-800-normal.woff2',
  './fonts/ibm-plex-sans-arabic-arabic-400-normal.woff2',
  './fonts/ibm-plex-sans-arabic-arabic-500-normal.woff2',
  './fonts/ibm-plex-sans-arabic-arabic-600-normal.woff2'
];
var ADHAN = 'https://cdn.jsdelivr.net/npm/adhan@4/lib/bundles/adhan.umd.min.js';

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) {
    return c.addAll(SHELL).then(function () { return c.add(ADHAN).catch(function () { /* يجيبها وقت التشغيل */ }); });
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('jojo-shell-') === 0 && k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.hostname.indexOf('supabase.co') !== -1) return;           // بيانات: من الشبكة دايمًا
  var sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && req.url !== ADHAN) return;

  // الصفحة نفسها: الشبكة أول (عشان التحديثات توصل)، وبدون نت من الكاش
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(function (r) {
      var copy = r.clone(); caches.open(VERSION).then(function (c) { c.put('./index.html', copy); });
      return r;
    }).catch(function () { return caches.match('./index.html'); }));
    return;
  }
  // الباقي (خطوط، أيقونات، core.js، adhan): من الكاش، ونحدّثه بالخلفية
  e.respondWith(caches.match(req).then(function (hit) {
    var net = fetch(req).then(function (r) {
      if (r && r.ok) { var copy = r.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); }
      return r;
    }).catch(function () { return hit; });
    return hit || net;
  }));
});
