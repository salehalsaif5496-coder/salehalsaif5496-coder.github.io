/* جوجو — Service Worker: يخزن واجهة التطبيق عشان يفتح بدون نت.
   النسخة تجي من رابط التسجيل (index.html: sw.js?v=JOJO_VERSION)، فكل نشر جديد = SW جديد + كاش جديد،
   والكاش القديم ينمسح عند التفعيل.
   طلبات Supabase ما تنخزن أبد (بيانات شخصية + الطابور المحلي يتكفل بالتأشير بدون نت). */
var V = new URL(self.location.href).searchParams.get('v') || '0';
var VERSION = 'jojo-shell-' + V;
var SHELL = [
  './', './index.html', './core.js?v=' + V, './vendor/adhan.umd.min.js?v=' + V, './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png',
  './fonts/baloo-bhaijaan-2-arabic-600-normal.woff2',
  './fonts/baloo-bhaijaan-2-arabic-700-normal.woff2',
  './fonts/baloo-bhaijaan-2-arabic-800-normal.woff2',
  './fonts/ibm-plex-sans-arabic-arabic-400-normal.woff2',
  './fonts/ibm-plex-sans-arabic-arabic-500-normal.woff2',
  './fonts/ibm-plex-sans-arabic-arabic-600-normal.woff2'
];
var NET_TIMEOUT = 4000;   // على نت ضعيف: بعد ٤ ثواني نفتح من الكاش

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) {
    // cache: 'reload' عشان ما ناخذ نسخة قديمة من كاش المتصفح
    return Promise.all(SHELL.map(function (u) {
      return fetch(new Request(u, { cache: 'reload' })).then(function (r) { if (r.ok) return c.put(u, r); });
    }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('jojo-shell-') === 0 && k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

/* الشبكة أول (بمهلة)، ونحدّث الكاش بالرد السليم بس؛ بدون نت أو بعد المهلة → الكاش */
function networkFirst(req, cacheKey) {
  return caches.open(VERSION).then(function (c) {
    var fromCache = function () { return c.match(cacheKey || req, { ignoreSearch: !cacheKey }); };
    var fromNet = fetch(req).then(function (r) {
      if (r && r.ok) { c.put(cacheKey || req, r.clone()); return r; }
      return fromCache().then(function (hit) { return hit || r; });   // 404/5xx وقت النشر: لا نخزنه، ونفضّل الكاش
    });
    var timeout = new Promise(function (res) { setTimeout(res, NET_TIMEOUT); }).then(fromCache);
    return Promise.race([fromNet.catch(fromCache), timeout.then(function (hit) { return hit || fromNet; })])
      .then(function (r) { return r || fromNet; })
      .catch(function () { return fromCache(); })
      .then(function (r) { return r || Response.error(); });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;                 // ولا شي من برّا (Supabase من الشبكة دايمًا)
  // صفحة صالح (/jojo/saleh/) داخل نطاق هذا الـ SW: ما نلمسها، وإلا تنحفظ مكان index.html حق جوجو
  if (url.pathname.indexOf(new URL('./saleh/', self.location.href).pathname) === 0) return;

  if (req.mode === 'navigate' || /\/index\.html$/.test(url.pathname)) {
    e.respondWith(networkFirst(req, './index.html'));
    return;
  }
  if (/\.js$/.test(url.pathname)) {                                 // core.js و vendor: الشبكة أول
    e.respondWith(networkFirst(req));
    return;
  }
  // خطوط وأيقونات: من الكاش، وإلا الشبكة
  e.respondWith(caches.match(req).then(function (hit) {
    return hit || fetch(req).then(function (r) {
      if (r && r.ok) { var copy = r.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); }
      return r;
    });
  }));
});
