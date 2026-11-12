// ビルド 6199581d53
const CACHE = 'hardentry-6199581d53';
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./'])).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  if (/\.(png|webmanifest)$/.test(u.pathname)) return;
  const page = e.request.mode === 'navigate' || u.pathname.endsWith('/') || u.pathname.endsWith('/index.html');
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(res => {
    if (res && res.ok && res.type === 'basic') { const cp = res.clone(); caches.open(CACHE).then(c => c.put(page ? './' : e.request, cp)); }
    return res;
  }).catch(() => caches.match(page ? './' : e.request).then(m => m || (page ? caches.match('./') : undefined))));
});
