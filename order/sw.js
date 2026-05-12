const CACHE_NAME = 'v2-pizza-voice';
const ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/app.js',
    '/storage.js',
    '/parser.js',
    '/favicon.svg'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(c => c.addAll(ASSETS))
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
        ))
    );
});

self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request).then(res => res || fetch(e.request))
    );
});
