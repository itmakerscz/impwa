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
        const stationStatus = ref({ GRILL: 'disconnected', PUB: 'disconnected' });

        const debugLogs = ref([]);
        
        const addLog = (msg) => {
            const timestamp = new Date().toLocaleTimeString();
            debugLogs.value.unshift(`[${timestamp}] ${msg}`);
            if (debugLogs.value.length > 50) debugLogs.value.pop();
        };

        const kitchenTickets = ref([]);
        const myRequests = ref([]);
        const inventory = ref([
            { id: 'item_1', name: 'Burger Patties' },
            { id: 'item_2', name: 'Beer Keg' },
            { id: 'item_3', name: 'Fries' }
        ]);

        const network = new WebRTCManager(
            (payload) => handleNetworkMessage(payload),
            (msg) => addLog(msg),
            (name, state) => {
                if (stationStatus.value[name] !== undefined) {
                    stationStatus.value[name] = state;
                }
                // If a station loses connection to the Hub, clear the local QR
                if (currentRole.value !== 'KITCHEN' && ['failed', 'disconnected'].includes(state)) {
                    const container = document.getElementById('station-qr-container');
                    if (container) container.innerHTML = '';
                }
            }
        );
        
        const isScanning = ref(false);
        const cameraPermissionDenied = ref(false);
        const hasTorch = ref(false);
        const isTorchOn = ref(false);
        const manualInput = ref('');
        const currentSyncQR = ref(null);
        let activeScanCallback = null;

        let html5QrCode = null;

        const stopScanner = async () => {
            if (html5QrCode && html5QrCode.isScanning) {
                if (isTorchOn.value) await toggleTorch();
                await html5QrCode.stop();
            }
            isScanning.value = false;
            cameraPermissionDenied.value = false;
            manualInput.value = '';
            activeScanCallback = null;
            hasTorch.value = false;
            currentSyncQR.value = null;
        };

        const startScanner = async (onScanSuccess) => {
            isScanning.value = true;
            cameraPermissionDenied.value = false;
            activeScanCallback = onScanSuccess;

            if (!html5QrCode) html5QrCode = new Html5Qrcode("qr-reader");
            
            try {
                await html5QrCode.start(
                    { facingMode: "environment" },
                    { 
                        fps: 20, // Increased FPS for faster recognition
                        qrbox: (viewfinderWidth, viewfinderHeight) => {
                            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
                            return { width: minEdge * 0.8, height: minEdge * 0.8 };
                        }
                    },
                    async (decodedText) => {
                        await stopScanner();
                        onScanSuccess(decodedText);
                    }
                );
                
                // Check if the camera supports torch
                const track = html5QrCode.getRunningTrackCapabilities();
                if (track.torch) {
                    hasTorch.value = true;
                }
            } catch (err) {
                console.error("Scanner error:", err);
                cameraPermissionDenied.value = true;
            }
        };

        const toggleTorch = async () => {
            isTorchOn.value = !isTorchOn.value;
            try {
                await html5QrCode.applyVideoConstraints({
                    advanced: [{ torch: isTorchOn.value }]
                });
            } catch (err) {
                console.error("Torch error:", err);
            }
        };

        const submitManualInput = async () => {
            if (manualInput.value && activeScanCallback) {
                const data = manualInput.value;
                await stopScanner();
                activeScanCallback(data);
            }
        };

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
            const el = document.getElementById(containerId);
            if (el) el.innerHTML = `<img src="${qrDataURI}" alt="QR" />`;
            return qrDataURI;
        };

        const setRole = (role) => currentRole.value = role;

        // --- Kitchen Methods ---
        const generateSyncQR = async (stationName) => {
            pendingStationSync = stationName;
            const offerStr = await network.createOfferForStation(stationName);
            currentSyncQR.value = offerStr;
            // Render to the hub container instead of the scanner overlay
            setTimeout(() => renderQR(offerStr, 'kitchen-qr-container'), 100);
        };

        const scanStationReply = () => {
            startScanner(async (answerStr) => {
                if (answerStr && pendingStationSync) {
                    await network.hubAcceptAnswer(pendingStationSync, answerStr);
                    addLog(`${pendingStationSync} connection completed.`);
                    currentSyncQR.value = null; // Hide the QR and button after success
                }
            });
        };

        const markAsDispatched = (ticket) => {
            kitchenTickets.value = kitchenTickets.value.filter(t => t.id !== ticket.id);
            network.sendToStation(ticket.station, { id: ticket.id, type: 'STATUS_UPDATE', newStatus: 'Dispatched!' });
        };

        // --- Station Methods ---
        const scanKitchenQR = () => {
            startScanner(async (offerStr) => {
                if (offerStr) {
                    const answerStr = await network.handleOfferAndCreateAnswer(offerStr);
                    renderQR(answerStr, 'station-qr-container');
                }
            });
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
            currentRole, setRole, inventory, kitchenTickets, myRequests, debugLogs, currentSyncQR, stationStatus,
            generateSyncQR, markAsDispatched, scanKitchenQR, requestItem, scanStationReply,
            isScanning, stopScanner, cameraPermissionDenied, manualInput, submitManualInput,
            hasTorch, isTorchOn, toggleTorch
        };
    }
}).mount('#app');