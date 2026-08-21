const CACHE = 'fastroads-pwa-v5';
const CORE = [
  './',
  './index.html',
  './manifest.json',
  './controls.js?v=7',
  './traffic.js?v=38',
  './ui-custom.js?v=2',
  './static/css/main.a473f648.chunk.css',
  './static/js/2.f5fa8177.chunk.js?v=2',
  './static/js/main.e7a33c55.chunk.js?v=5',
  './static/media/favicon_circle_white.eb1953e3.svg',
  './static/media/fastroads-icon-192.png',
  './static/media/fastroads-icon-512.png',
  './static/media/fastroads-apple-touch-icon.png'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response.ok && (url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.endsWith('.png') || url.pathname.endsWith('.jpg') || url.pathname.endsWith('.svg') || url.pathname.endsWith('.woff') || url.pathname.endsWith('.ttf'))) {
      const copy = response.clone();
      caches.open(CACHE).then(cache => cache.put(event.request, copy));
    }
    return response;
  }).catch(() => caches.match('./index.html'))));
});
