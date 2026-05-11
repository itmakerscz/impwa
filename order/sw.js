const CACHE_NAME = 'pizza-v1';
const ASSETS = ['./', './index.html', './style.css', './app.js', './storage.js', './favicon.svg'];

self.addEventListener('install', (e) => {
    e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS)));
});

self.addEventListener('fetch', (e) => {
    e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
