const CACHE_NAME = 'wasm-rtc-v1';
const ASSETS = [
  'index.html',
  'app.js',
  'manifest.json',
  'pkg/wasm_webrtc_pwa.js',
  'pkg/wasm_webrtc_pwa_bg.wasm'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => response || fetch(e.request))
  );
});