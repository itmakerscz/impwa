const CACHE_NAME = 'rest-sync-v1';
const ASSETS = [
    '/',
    'index.html',
    'css/style.css',
    'js/app.js',
    'js/webrtc.js',
    'js/wasm_exec.js',
    'wasm/qr_generator.wasm',
    'https://unpkg.com/vue@3/dist/vue.esm-browser.js'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then(response => response || fetch(event.request))
    );
});