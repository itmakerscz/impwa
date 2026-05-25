import { createApp, ref } from 'vue';
import { WebRTCManager } from './webrtc.js';

let goWasmLoaded = false;
const go = new Go();
WebAssembly.instantiateStreaming(fetch('wasm/qr_generator.wasm'), go.importObject)
    .then((result) => {
        go.run(result.instance);
        goWasmLoaded = true;
    }).catch(err => console.error("Wasm load failed:", err));

createApp({
    setup() {
        const currentRole = ref(null);
        const kitchenTickets = ref([]);
        const myRequests = ref([]);
        const inventory = ref([
            { id: 'item_1', name: 'Burger Patties' },
            { id: 'item_2', name: 'Beer Keg' },
            { id: 'item_3', name: 'Fries' }
        ]);

        const network = new WebRTCManager((payload) => handleNetworkMessage(payload));
        
        let pendingStationSync = null; // Tracks which station the Kitchen is currently syncing

        const handleNetworkMessage = (payload) => {
            if (currentRole.value === 'KITCHEN' && payload.type === 'RESTOCK_REQUEST') {
                kitchenTickets.value.push(payload);
            } else if (currentRole.value !== 'KITCHEN' && payload.type === 'STATUS_UPDATE') {
                const req = myRequests.value.find(r => r.id === payload.id);
                if (req) req.status = payload.newStatus;
            }
        };

        const renderQR = (dataString, containerId) => {
            if (!goWasmLoaded) return alert("Wasm loading...");
            const qrDataURI = window.generateGolangQRCode(dataString);
            document.getElementById(containerId).innerHTML = `<img src="${qrDataURI}" alt="QR" />`;
        };

        const setRole = (role) => currentRole.value = role;

        // --- Kitchen Methods ---
        const generateSyncQR = async (stationName) => {
            pendingStationSync = stationName;
            const offerStr = await network.createOfferForStation(stationName);
            renderQR(offerStr, 'qr-container');
        };

        const scanStationAnswer = async () => {
            // NOTE: In production, integrate html5-qrcode library here. Using prompt for simulation.
            const answerStr = prompt(`Paste Answer SDP from ${pendingStationSync} here:`);
            if (answerStr && pendingStationSync) {
                await network.hubAcceptAnswer(pendingStationSync, answerStr);
                document.getElementById('qr-container').innerHTML = `<p class="status-confirmed">${pendingStationSync} Connected!</p>`;
            }
        };

        const markAsDispatched = (ticket) => {
            kitchenTickets.value = kitchenTickets.value.filter(t => t.id !== ticket.id);
            network.sendToStation(ticket.station, { id: ticket.id, type: 'STATUS_UPDATE', newStatus: 'Dispatched!' });
        };

        // --- Station Methods ---
        const scanKitchenQR = async () => {
            // NOTE: Simulate scanning Kitchen QR
            const offerStr = prompt("Paste Kitchen Offer SDP here:");
            if (offerStr) {
                const answerStr = await network.handleOfferAndCreateAnswer(offerStr);
                renderQR(answerStr, 'station-qr-container'); // Show this to the kitchen
            }
        };

        const requestItem = (item) => {
            const req = {
                id: crypto.randomUUID(),
                station: currentRole.value,
                type: 'RESTOCK_REQUEST',
                itemId: item.id,
                itemName: item.name,
                status: 'Awaiting Kitchen',
                timestamp: Date.now()
            };
            myRequests.value.push(req);
            network.sendToKitchen(req);
        };

        return {
            currentRole, setRole, inventory, kitchenTickets, myRequests,
            generateSyncQR, scanStationAnswer, markAsDispatched, scanKitchenQR, requestItem
        };
    }
}).mount('#app');