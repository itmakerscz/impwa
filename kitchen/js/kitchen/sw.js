const CACHE_NAME = 'rest-sync-v2';
const ASSETS = [
    'index.html',
    'css/style.css',
    'js/app.js',
    'js/webrtc.js',
    'js/wasm_exec.js',
    'wasm/qr_generator.wasm',
    'https://unpkg.com/vue@3/dist/vue.esm-browser.prod.js',
    'https://unpkg.com/html5-qrcode/html5-qrcode.min.js'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            for (const asset of ASSETS) {
                await cache.add(asset).catch(err => {
                    console.error(`[ServiceWorker] Failed to cache resource: ${asset}`, err);
                    throw err;
                });
            }
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        Promise.all([
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME) {
                            console.log('[ServiceWorker] Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            }),
            // Enable navigation preload if the browser supports it
            self.registration.navigationPreload ? self.registration.navigationPreload.enable() : Promise.resolve()
        ]).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith((async () => {
        // 1. Try to serve from cache first
        const cachedResponse = await caches.match(event.request);
        if (cachedResponse) return cachedResponse;

        // 2. If it's a navigation request, try the preload response
        const preloadResponse = await event.preloadResponse;
        if (preloadResponse) return preloadResponse;

        // 3. Fallback to network
        return fetch(event.request);
    })());
});