const CACHE_NAME = 'v4-pizza-voice';
const ASSETS = [
    '.',
    'index.html',
    'orders.html',
    'style.css',
    'app/app.js',
    'app/orders.js',
    'app/storage.js',
    'app/parser.js',
    'favicon.svg',
    'https://unpkg.com/vue@3/dist/vue.global.prod.js'
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
