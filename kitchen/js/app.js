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
                    { 
                        facingMode: "environment",
                        width: { ideal: 1280 },
                        height: { ideal: 720 }
                    },
                    { 
                        fps: 15,
                        qrbox: (viewfinderWidth, viewfinderHeight) => {
                            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
                            const size = Math.floor(minEdge * 0.7);
                            return { width: size, height: size };
                        },
                        aspectRatio: 1.0,
                        experimentalFeatures: {
                            useBarCodeDetectorIfSupported: true
                        }
                    },
                    async (decodedText) => {
                        await stopScanner();
                        onScanSuccess(decodedText);
                    }
                );
                
                // Delay capability check to ensure hardware stabilization
                setTimeout(() => {
                    try {
                        const capabilities = html5QrCode.getRunningTrackCapabilities();
                        if (capabilities && capabilities.torch) {
                            hasTorch.value = true;
                        }
                    } catch (e) {
                        console.warn("Camera capabilities not fully available yet:", e);
                    }
                }, 500);
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
                // Check if already exists to prevent duplicates
                if (kitchenTickets.value.some(t => t.id === payload.id)) return;
                kitchenTickets.value.push(payload);
                addLog(`New request: ${payload.itemName} from ${payload.station}`);
            } else if (currentRole.value !== 'KITCHEN' && payload.type === 'STATUS_UPDATE') {
                const req = myRequests.value.find(r => r.id === payload.id);
                if (req) {
                    req.status = payload.newStatus;
                    req.completed = payload.newStatus === 'Dispatched!';
                    addLog(`Order Update: ${payload.newStatus}`);
                }
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

        const markAsDispatched = (ticket) => {
            kitchenTickets.value = kitchenTickets.value.filter(t => t.id !== ticket.id);
            network.sendToStation(ticket.station, { id: ticket.id, type: 'STATUS_UPDATE', newStatus: 'Dispatched!' });
        };

        // --- Station Methods ---
        const scanKitchenQR = () => {
            startScanner(async (offerStr) => {
                if (offerStr) {
                    await network.handleOfferAndCreateAnswer(offerStr);
                    addLog("Handshake sent! Waiting for connection...");
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
                timestamp: Date.now(),
                completed: false
            };
            myRequests.value.unshift(req);
            network.sendToKitchen(req);
        };

        return {
            currentRole, setRole, inventory, kitchenTickets, myRequests, debugLogs, currentSyncQR, stationStatus,
            generateSyncQR, markAsDispatched, scanKitchenQR, requestItem,
            isScanning, stopScanner, cameraPermissionDenied, manualInput, submitManualInput,
            hasTorch, isTorchOn, toggleTorch
        };
    }
}).mount('#app');