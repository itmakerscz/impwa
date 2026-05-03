export const DB = {
    dbName: "WorkTimerDB",
    version: 2,
    _db: null,

    async open() {
        if (this._db) return this._db;
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains("logs")) {
                    db.createObjectStore("logs", { keyPath: "id", autoIncrement: true });
                }
                if (!db.objectStoreNames.contains("projects")) {
                    db.createObjectStore("projects", { keyPath: "name" });
                }
            };
            request.onsuccess = (e) => {
                this._db = e.target.result;
                resolve(this._db);
            };
            request.onerror = (e) => reject(e.target.error);
        });
    },

    async getLogs() {
        const db = await this.open();
        return new Promise(resolve => {
            const transaction = db.transaction("logs", "readonly");
            transaction.objectStore("logs").getAll().onsuccess = (e) => resolve(e.target.result);
        });
    },

    async saveLog(log) {
        const db = await this.open();
        const transaction = db.transaction("logs", "readwrite");
        return new Promise(resolve => {
            transaction.objectStore("logs").add(log).onsuccess = () => resolve();
        });
    },

    async saveLogs(logs) {
        const db = await this.open();
        const transaction = db.transaction("logs", "readwrite");
        const store = transaction.objectStore("logs");
        return new Promise((resolve, reject) => {
            logs.forEach(log => store.add(log));
            transaction.oncomplete = () => resolve();
            transaction.onerror = (e) => reject(e.target.error);
        });
    },

    async deleteLog(id) {
        const db = await this.open();
        const transaction = db.transaction("logs", "readwrite");
        return new Promise(resolve => {
            transaction.objectStore("logs").delete(id).onsuccess = () => resolve();
        });
    },

    async updateLog(log) {
        const db = await this.open();
        const transaction = db.transaction("logs", "readwrite");
        return new Promise(resolve => {
            transaction.objectStore("logs").put(log).onsuccess = () => resolve();
        });
    },

    async updateLogs(logs) {
        const db = await this.open();
        const transaction = db.transaction("logs", "readwrite");
        const store = transaction.objectStore("logs");
        return new Promise((resolve, reject) => {
            logs.forEach(log => store.put(log));
            transaction.oncomplete = () => resolve();
            transaction.onerror = (e) => reject(e.target.error);
        });
    },

    async getProjects() {
        const db = await this.open();
        return new Promise(resolve => {
            const transaction = db.transaction("projects", "readonly");
            transaction.objectStore("projects").getAll().onsuccess = (e) => resolve(e.target.result);
        });
    },

    async saveProject(project) {
        const db = await this.open();
        const transaction = db.transaction("projects", "readwrite");
        return new Promise(resolve => {
            transaction.objectStore("projects").put(project).onsuccess = () => resolve();
        });
    },

    async deleteProject(name) {
        const db = await this.open();
        const transaction = db.transaction("projects", "readwrite");
        return new Promise(resolve => {
            transaction.objectStore("projects").delete(name).onsuccess = () => resolve();
        });
    },

    async deleteDatabase() {
        if (this._db) {
            this._db.close();
            this._db = null;
        }
        return new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase(this.dbName);
            request.onsuccess = () => resolve();
            request.onerror = (e) => reject(e.target.error);
        });
    }
};