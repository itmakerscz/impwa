export const saveToDB = (data) => {
    const request = indexedDB.open("PizzaStore", 1);

    request.onupgradeneeded = (e) => {
        e.target.result.createObjectStore("orders", { keyPath: "id", autoIncrement: true });
    };

    request.onsuccess = (e) => {
        const db = e.target.result;
        const tx = db.transaction("orders", "readwrite");
        tx.objectStore("orders").add({ ...data, date: new Date() });
    };
};
