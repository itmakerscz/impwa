const DB_NAME = 'PizzaAppDB';
const STORE_NAME = 'orders';
const DICTIONARY_STORE = 'dictionary';
const DB_VERSION = 2;

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
            if (!database.objectStoreNames.contains(DICTIONARY_STORE)) {
                database.createObjectStore(DICTIONARY_STORE, { keyPath: 'nickname' });
            }
        };

        request.onsuccess = () => resolve(db = request.result);
        request.onerror = () => reject(request.error);
    });
};

const execute = async (storeName, mode, action) => {
    const database = await getDB();
    return new Promise((resolve, reject) => {
        const tx = database.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const request = action(store);
        let operationResult;

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
        ...order,
        created_at: new Date().toISOString(),
        status: 'pending'
    };
    return execute(STORE_NAME, 'readwrite', store => store.add(data));
};

export const getAllOrders = () => execute(STORE_NAME, 'readonly', store => store.getAll());
export const deleteOrder = (id) => execute(STORE_NAME, 'readwrite', store => store.delete(id));

export const saveNickname = (nickname, pizzaName) => execute(DICTIONARY_STORE, 'readwrite', store => store.put({ nickname: nickname.toLowerCase(), pizzaName }));
export const getDictionary = () => execute(DICTIONARY_STORE, 'readonly', store => store.getAll());
export const deleteNickname = (nickname) => execute(DICTIONARY_STORE, 'readwrite', store => store.delete(nickname.toLowerCase()));
                                        
