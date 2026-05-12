const DB_NAME = 'PizzaAppDB';
const STORE_NAME = 'orders';
const DB_VERSION = 1;

let db = null;

const getDB = () => {
    if (db) return Promise.resolve(db);
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (e) => {
            const database = e.target.result;
            if (!database.objectStoreNames.contains(STORE_NAME)) {
                database.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
            }
        };

        request.onsuccess = () => resolve(db = request.result);
        request.onerror = () => reject(request.error);
    });
};

const execute = async (mode, action) => {
    const database = await getDB();
    return new Promise((resolve, reject) => {
        const tx = database.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        const request = action(store);
        let operationResult; // Variable to hold the result of the specific operation

        request.onsuccess = (event) => {
            operationResult = event.target.result; // Capture the result here
        };
        request.onerror = (event) => reject(event.target.error); // Handle individual request errors

        tx.oncomplete = () => resolve(operationResult); // Resolve with the captured result when the transaction completes
        tx.onerror = (event) => reject(event.target.error); // Handle transaction errors
    });
};

export const saveOrder = (order) => {
    const data = {
        ...Vue.toRaw(order), // 2026 Best practice: use native toRaw
        created_at: new Date().toISOString(),
        status: 'pending'
    };
    return execute('readwrite', store => store.add(data));
};

export const getAllOrders = () => execute('readonly', store => store.getAll());
export const deleteOrder = (id) => execute('readwrite', store => store.delete(id));
                                        
