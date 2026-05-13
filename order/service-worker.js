const CACHE_NAME = 'pizza-order-v1';

// List all assets based on your project structure
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './app/app.js',
    './app/storage.js',
    './app/parser.js',
    './app/audio-processor.js',
    './app/speech-synthesizer.js',
    './app/orders.js',
    './app/composables/useSpeechRecognition.js',
    './app/composables/useOrderManager.js',
    './app/composables/useNotification.js',
    './app/external/artyom.window.min.js'
];

/**
 * Listen for messages from the client.
 */
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

/**
 * The Install event.
 * We loop through the assets individually instead of using addAll() 
 * to identify exactly which request fails.
 */
self.addEventListener('install', (event) => {
    console.log('[Service Worker] Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            console.log('[Service Worker] Caching all assets');
            const results = await Promise.allSettled(
                ASSETS_TO_CACHE.map(url => 
                    cache.add(url).catch(err => {
                        console.error(`[Service Worker] Failed to fetch/cache: ${url}`, err);
                        throw err; // Re-throw to mark as rejected in allSettled
                    })
                )
            );
            
            const failed = results.filter(r => r.status === 'rejected');
            if (failed.length > 0) {
                console.error(`[Service Worker] ${failed.length} assets failed to cache. Check logs above.`);
            }
        })
    );
});

/**
 * Fetch Strategy: Cache Falling Back to Network
 */
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request).catch(() => {
                // Fallback for when both cache and network fail (e.g. offline)
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
            });
        })
    );
});