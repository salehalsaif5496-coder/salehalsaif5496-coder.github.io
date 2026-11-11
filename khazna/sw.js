// الخزنة — يشتغل حتى بدون نت
const CACHE = 'khazna-v3';
const CORE = ['./', './index.html', './manifest.webmanifest', './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('khazna-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // الخطوط: من المحفوظ أول
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => { const c = res.clone(); caches.open(CACHE).then(x => x.put(req, c)); return res; })));
    return;
  }
  if (url.origin !== location.origin || !url.pathname.startsWith('/khazna/')) return;
  // ملفات التطبيق: من النت أول (عشان التحديثات)، ولو ما فيه نت من المحفوظ
  e.respondWith(fetch(req, { cache: 'no-store' }).then(res => {
    if (res.ok) { const c = res.clone(); caches.open(CACHE).then(x => x.put(req, c)); }
    return res;
  }).catch(() => caches.match(req).then(hit => hit || caches.match('./index.html'))));
});

// إشعارات المهام من سيرفر الخزنة
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'الخزنة', {
    body: d.body || '', tag: d.tag, renotify: true, dir: 'rtl', lang: 'ar',
    icon: '/khazna/icons/icon-192.png', badge: '/khazna/icons/icon-192.png',
    data: { url: d.url || '/khazna/#tasks' },
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || '/khazna/#tasks', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(ws => {
    for (const w of ws) if (w.url.includes('/khazna/') && 'focus' in w) return w.focus().then(f => (f && 'navigate' in f ? f.navigate(url) : f)).catch(() => self.clients.openWindow(url));
    return self.clients.openWindow(url);
  }));
});
