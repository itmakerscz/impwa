// storage.js
const DB_NAME = 'PizzaAppDB';
const STORE_NAME = 'orders';
const DICTIONARY_STORE = 'dictionary';
const ARCHIVED_STORE_NAME = 'archived_orders'; // New store for archived orders
const STATS_STORE = 'stats';
const MENU_STORE = 'menu';
const DB_VERSION = 4;

let db = null;

// Initialize BroadcastChannel for cross-tab synchronization
const syncChannel = new BroadcastChannel('gastrohub_sync');

const notifyTabs = () => syncChannel.postMessage({ type: 'RELOAD_REQUIRED' });

const getDB = () => {
    if (db) return Promise.resolve(db);
    return new Promise((resolve, reject) => {
        const request = globalThis.indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (e) => {
            const database = e.target.result;
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                database.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
            if (!database.objectStoreNames.contains(DICTIONARY_STORE)) {
                database.createObjectStore(DICTIONARY_STORE, { keyPath: 'nickname' });
            }
            if (!database.objectStoreNames.contains(ARCHIVED_STORE_NAME)) {
                database.createObjectStore(ARCHIVED_STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
            if (!database.objectStoreNames.contains(STATS_STORE)) {
                database.createObjectStore(STATS_STORE, { keyPath: 'date' });
            }
            if (!database.objectStoreNames.contains(MENU_STORE)) {
                database.createObjectStore(MENU_STORE, { keyPath: 'id', autoIncrement: true });
            }
        };

        request.onsuccess = () => resolve(db = request.result);
        request.onerror = () => reject(request.error);
    });
};

const execute = async (storeName, mode, action) => {
    const database = await getDB();
    return new Promise((resolve, reject) => {
        const tx = database.transaction(storeName, mode, { durability: 'relaxed' });
        const store = tx.objectStore(storeName);
        const request = action(store);
        
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
        tx.onerror = (event) => reject(event.target.error);
    });
};

export const getDailyStats = (date) => execute(STATS_STORE, 'readonly', store => store.get(date));

/**
 * Updates the daily sales count for a specific category.
 * @param {string} category - e.g., 'pizza' or 'grill'
 */
const incrementDailyStats = async (category) => {
    const date = new Date().toISOString().split('T')[0];
    const currentStats = await getDailyStats(date) || { date, pizza: 0, grill: 0 };
    
    // Ensure the category exists in the object to avoid NaN
    currentStats[category] = (currentStats[category] || 0) + 1;
    
    return execute(STATS_STORE, 'readwrite', store => store.put(currentStats));
};

export const saveOrder = async (order) => {
    // Ensure we are working with a raw object to avoid Proxy cloning errors
    const rawOrder = JSON.parse(JSON.stringify(order));
    // Expand items into individual units for separate tracking if quantity > 1
    const detailedItems = [];
    (rawOrder.items || []).forEach(it => {
        for(let i = 0; i < it.quantity; i++) {
            detailedItems.push({
                id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9),
                name: it.name,
                category: it.category,
                status: 'pending', // Individual item status
                prepTime: it.prepTime,
                extras: it.extras || "", // Persist extra ingredients
                extrasPrice: it.extrasPrice || 0,
                isRush: it.isRush || false // Persist isRush flag
            });
        }
    });

    const data = {
        ...rawOrder,
        items: detailedItems,
        created_at: new Date().toISOString(),
        status: 'pending',
        sort_order: Date.now() // Initialize with timestamp for default sequential sorting
    };
    const orderId = await execute(STORE_NAME, 'readwrite', store => store.add(data));
    if (rawOrder.items) {
        for (const it of rawOrder.items) await incrementDailyStats(it.category || 'pizza');
    }
    notifyTabs();
    return orderId;
};

// --- NOVÁ KLÍČOVÁ FUNKCE PRO AKTUALIZACI STAVŮ ---
export const updateOrder = async (order) => {
    // IndexedDB structured clone fails on Vue 3 Proxy objects.
    // We convert to a plain object to ensure compatibility.
    const rawOrder = JSON.parse(JSON.stringify(order));
    const result = await execute(STORE_NAME, 'readwrite', store => store.put(rawOrder));
    notifyTabs();
    return result;
};

export const getAllOrders = () => execute(STORE_NAME, 'readonly', store => store.getAll());
export const getArchivedOrders = () => execute(ARCHIVED_STORE_NAME, 'readonly', store => store.getAll());

export const archiveOrder = async (id) => {
    const database = await getDB();
    return new Promise((resolve, reject) => {
        const tx = database.transaction([STORE_NAME, ARCHIVED_STORE_NAME], 'readwrite', { durability: 'relaxed' });
        const ordersStore = tx.objectStore(STORE_NAME);
        const archivedStore = tx.objectStore(ARCHIVED_STORE_NAME);

        const getRequest = ordersStore.get(id);
        getRequest.onsuccess = () => {
            const orderToArchive = { ...getRequest.result, archived_at: new Date().toISOString() };
            archivedStore.add(orderToArchive); // Add to archive
            ordersStore.delete(id); // Delete from active orders
        };
        tx.oncomplete = () => {
            notifyTabs();
            resolve(true);
        };
        tx.onerror = (event) => reject(event.target.error);
    });
};

export const saveNickname = (nickname, pizzaName) => execute(DICTIONARY_STORE, 'readwrite', store => store.put({ nickname: nickname.toLowerCase(), pizzaName }));
export const getDictionary = () => execute(DICTIONARY_STORE, 'readonly', store => store.getAll());
export const deleteNickname = (nickname) => execute(DICTIONARY_STORE, 'readwrite', store => store.delete(nickname.toLowerCase()));

export const getMenu = () => execute(MENU_STORE, 'readonly', store => store.getAll());
export const saveMenuItem = (item) => execute(MENU_STORE, 'readwrite', store => store.put(item));
export const deleteMenuItem = (id) => execute(MENU_STORE, 'readwrite', store => store.delete(id));

/**
 * Maintenance: Clears orders older than 30 days to ensure performance.
 */
export const purgeOldOrders = async (days = 30) => { // Renamed to archiveOldOrders for clarity
    const orders = await getAllOrders();
    const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
    const oldIds = orders
        .filter(o => new Date(o.created_at).getTime() < cutoff)
        .map(o => o.id);
    
    for (const id of oldIds) { // Now archives instead of deleting
        await archiveOrder(id);
    }
    return oldIds.length; // Returns count of archived orders
};