const CACHE = 'ryosei-map-v2';

const PRECACHE = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // data.json: network-first (fresh data preferred; fall back to cache)
  if (url.pathname.endsWith('data.json') || url.hostname === 'raw.githubusercontent.com') {
    event.respondWith(
      fetch(request)
        .then(resp => {
          const clone = resp.clone();
          caches.open(CACHE).then(c => c.put(request, clone));
          return resp;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Everything else: cache-first
  event.respondWith(
    caches.match(request).then(cached => cached ?? fetch(request))
  );
});
