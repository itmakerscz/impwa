import { createApp, ref, nextTick } from 'vue';
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
        
        // Run NAT diagnostic on startup
        network.detectNATType().then(type => {
            addLog(`NAT Diagnostic: ${type}`);
            if (type.includes('Symmetric')) addLog("Tip: You likely need a TURN server for this network.");
        });

        const isScanning = ref(false);
        const cameraPermissionDenied = ref(false);
        const hasTorch = ref(false);
        const isTorchOn = ref(false);
        const manualInput = ref('');
        const currentFacingMode = ref('environment');
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
            activeScanCallback = null;
            hasTorch.value = false;
            currentSyncQR.value = null;
        };

        const startScanner = async (onScanSuccess) => {
            // 1. Security Check: Camera requires HTTPS or Localhost
            if (!window.isSecureContext) {
                const msg = "Camera access requires a secure connection (HTTPS).";
                addLog(`Error: ${msg}`);
                alert(msg);
                return;
            }

            isScanning.value = true;
            cameraPermissionDenied.value = false;
            activeScanCallback = onScanSuccess;

            // 2. Wait for Vue to render the #qr-reader element
            await nextTick();

            // 3. Clean up existing instance to avoid "Scanner already running"
            if (html5QrCode) {
                try { await html5QrCode.stop(); } catch (e) { /* ignore */ }
            }
            
            // Explicitly limit to QR_CODE to improve performance and accuracy
            html5QrCode = new Html5Qrcode("qr-reader", { 
                formatsToSupport: [ Html5QrcodeSupportedFormats.QR_CODE ] 
            });
            
            try {
                await html5QrCode.start(
                    { facingMode: currentFacingMode.value },
                    { 
                        fps: 15,
                        videoConstraints: { 
                            facingMode: currentFacingMode.value,
                            width: { ideal: 720 }, 
                            height: { ideal: 720 } 
                        },
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
                addLog(`Camera Error: ${err.message || err}`);
                cameraPermissionDenied.value = true;
                isScanning.value = false;
                if (err.name === 'NotAllowedError') alert("Camera permission denied.");
            }
        };

        const switchCamera = async () => {
            // Toggle between 'environment' (back) and 'user' (front)
            currentFacingMode.value = currentFacingMode.value === 'environment' ? 'user' : 'environment';
            
            if (isScanning.value && activeScanCallback) {
                const callback = activeScanCallback;
                await stopScanner();
                await startScanner(callback);
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
            if (!manualInput.value || !manualInput.value.trim()) return;
            
            const data = manualInput.value.trim();
            
            // If scanner is active, treat this as the result of the scan
            if (activeScanCallback) {
                const callback = activeScanCallback;
                await stopScanner();
                callback(data);
                manualInput.value = '';
            } else if (currentRole.value && currentRole.value !== 'KITCHEN') {
                // Stations (GRILL/PUB) can connect via manual input at any time
                addLog("Processing manual connection string...");
                try {
                    await network.handleOfferAndCreateAnswer(data);
                    addLog("Manual handshake initiated successfully.");
                    manualInput.value = '';
                } catch (err) {
                    addLog(`Manual connect error: ${err.message}`);
                }
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
            const result = window.generateGolangQRCode(dataString);
            
            if (result.startsWith("Error")) {
                addLog(result);
                return null;
            }

            const el = document.getElementById(containerId);
            if (el) el.innerHTML = `<img src="${result}" alt="QR Code" style="width: 100%; height: 100%; image-rendering: pixelated;" />`;
            
            // Allow result to be GC'd by not returning it if not needed
            const temp = result;
            return null; 
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
        
        const scanStationAnswer = () => {
            if (!pendingStationSync) return;
            startScanner(async (answerStr) => {
                if (answerStr) {
                    await network.hubAcceptAnswer(pendingStationSync, answerStr);
                    addLog(`Answer received for ${pendingStationSync}. Connecting...`);
                    answerStr = null; // Clear large string reference
                }
            });
        };

        // --- Station Methods ---
        const stationAnswerQR = ref(null);

        const scanKitchenQR = () => {
            startScanner(async (offerStr) => {
                if (offerStr) {
                    let answerStr = await network.handleOfferAndCreateAnswer(offerStr);
                    stationAnswerQR.value = answerStr;
                    addLog("Answer generated! Show this QR to the Kitchen Hub.");
                    
                    nextTick(() => {
                        renderQR(answerStr, 'station-answer-qr-container');
                        answerStr = null; 
                    });
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
            generateSyncQR, markAsDispatched, scanKitchenQR, requestItem, scanStationAnswer,
            isScanning, stopScanner, cameraPermissionDenied, manualInput, submitManualInput,
            hasTorch, isTorchOn, toggleTorch, currentFacingMode, switchCamera, stationAnswerQR
        };
    }
}).mount('#app');