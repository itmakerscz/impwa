const CACHE_NAME = 'v12-pizza-voice';
const ASSETS = [
    '.',
    'index.html',
    'orders.html',
    'style.css',
    'app/app.js',
    'app/orders.js',
    'app/storage.js',
    'app/parser.js',
    'app/audio-processor.js',
    'app/speech-synthesizer.js',
    'app/useSpeechRecognition.js',
    'app/useOrderManager.js',
    'favicon.svg',
    'https://unpkg.com/vue@3/dist/vue.global.prod.js'
];

self.addEventListener('install', (e) => {
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME).then(c => c.addAll(ASSETS))
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
        )).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (e) => {
    e.respondWith(
        caches.match(e.request).then(res => res || fetch(e.request))
    );
});
