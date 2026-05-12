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

self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-orders') {
        event.waitUntil(syncOrders());
    }
});

self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'update-pizza-menu') {
        event.waitUntil(updateMenu());
    }
});

async function syncOrders() {
    const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('PizzaAppDB', 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });

    const tx = db.transaction('orders', 'readwrite');
    const store = tx.objectStore('orders');
    const orders = await new Promise((resolve) => {
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
    });

    const pendingOrders = orders.filter(o => o.status === 'pending');

    for (const order of pendingOrders) {
        try {
            // Replace with your actual server endpoint
            const response = await fetch('https://api.example.com/orders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(order)
            });

            if (response.ok) {
                const updateTx = db.transaction('orders', 'readwrite');
                const updateStore = updateTx.objectStore('orders');
                order.status = 'synced';
                updateStore.put(order);
                await new Promise(r => updateTx.oncomplete = r);
            }
        } catch (err) {
            console.error('Failed to sync order', order.id, err);
            // Throwing here triggers the browser's retry logic
            throw err; 
        }
    }
}

async function updateMenu() {
    try {
        // Replace with your actual menu endpoint
        const response = await fetch('https://api.example.com/menu');
        if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put('https://api.example.com/menu', response);
        }
    } catch (err) {
        console.error('Background menu update failed', err);
    }
}
