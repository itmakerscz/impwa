const DB_NAME = "PizzaPWA";
const STORE_NAME = "orders";

function saveOrder(orderData) {
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = (e) => {
        const db = e.target.result;
        db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
    };

    request.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).add({ ...orderData, created: new Date() });
    };
}
