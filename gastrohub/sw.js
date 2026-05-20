// sw.js
// Bumping version to v2026.6 for comprehensive asset coverage including core modules
const CACHE_NAME = 'gastrohub-core-v2026.6';

// Array list pinning resource targets required for completely offline bootstrap runtimes
const IMMUTABLE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './utils.js',
  './storage.js',
  './parser.js',
  './audio-processor.js',
  './speech-synthesizer.js',
  './extractor.js',
  './kitchen-worker.js',
  './parser-worker.js',
  './components/NavButton.js',
  './components/KanbanColumn.js',
  './components/StationBoard.js',
  './components/OrderDetailForm.js',
  './components/TabRec.js',
  './components/TabScanner.js',
  './components/TabRoutes.js',
  './components/TabRoutes.css',
  './components/TabKitchen.js',
  './components/TabGrill.js',
  './components/TabMenu.js',
  './composables/useOrderManager.js',
  './composables/useSpeech.js',
  './composables/useSpeechRecognition.js',
  './composables/useKitchenStation.js',
  './composables/useScanner.js',
  './composables/useRouteManagement.js',
  './composables/useNotification.js',
  './composables/useModal.js',
  './composables/useMenuEditor.js',
  './composables/useMaintenance.js',
  './manifest.json',
  'https://unpkg.com/vue@3/dist/vue.global.prod.js',
  'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'
];

// Installs cache tables instantly on first launch
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(IMMUTABLE_ASSETS))
  );
});

// Listener for the UI to manually trigger activation of a waiting worker
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Clears obsolete legacy worker footprints during state alterations
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Enable Navigation Preload
      ('navigationPreload' in self.registration) 
        ? self.registration.navigationPreload.enable() 
        : Promise.resolve(),
      // Cleanup old caches
      caches.keys().then((keys) => {
        return Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
          })
        );
      })
    ]).then(() => self.clients.claim())
  );
});

// Cache-First intercept engine processing framework calls
self.addEventListener('fetch', (event) => {
  // Only intercept local HTTP/HTTPS traffic requests (skips edge browser-extension injections)
  if (!event.request.url.startsWith(self.location.origin) && !event.request.url.startsWith('https://')) {
    return;
  }

  // Priority: Navigation Preload -> Cache -> Network
  if (event.preloadResponse) {
    event.respondWith((async () => {
      const preloadResponse = await event.preloadResponse;
      if (preloadResponse) return preloadResponse;
      return fetch(event.request);
    })());
    return;
  }

  // Dynamic caching for any JS files in the composables directory
  const isComposable = event.request.url.includes('/composables/') && event.request.url.endsWith('.js');

  if (isComposable) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cachedResponse = await cache.match(event.request);
      
      // Revalidation: Start network fetch to update cache for next time
      const networkFetch = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          cache.put(event.request, networkResponse.clone());
          // Notify active clients that a background update occurred
          self.clients.matchAll({ type: 'window' }).then(clients => {
            clients.forEach(client => client.postMessage({
              type: 'RESOURCE_UPDATED',
              url: event.request.url
            }));
          });
        }
        return networkResponse;
      });

      // Instant Loading: Return cached version if available, else wait for network
      return cachedResponse || networkFetch;
    })());
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      
      return fetch(event.request).then((networkResponse) => {
        // Guard check validating standard payloads before keeping inside device data pool
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });

        return networkResponse;
      }).catch(() => {
        // Gracefully sink requests if connection completely drops out in the field
        return new Response("Network offline connection failure dropped resource catch trace request.", {
          status: 503,
          statusText: "Service Unavailable"
        });
      });
    })
  );
});