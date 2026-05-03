const CACHE_NAME = 'timetracker-v9';
const ASSETS = [
    './',
    './index.html',
    './style.css',
    './manifest.json',
    './app/main.js',
    './app/services/db-service.js',
    './app/services/work-service.js',
    './app/services/l18n-service.js',
    './app/services/l18n.json',
    'https://unpkg.com/vue@3/dist/vue.global.js',
    'https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js',
    'https://fonts.googleapis.com/icon?family=Material+Icons+Outlined'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
            );
        })
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});