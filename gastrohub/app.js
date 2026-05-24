// app.js
import { useSpeechRecognition } from './composables/useSpeechRecognition.js';
import { useOrderManager } from './composables/useOrderManager.js';
import { useSpeech } from './composables/useSpeech.js'; // New import
import { useKitchenStation } from './composables/useKitchenStation.js';
import { useScanner } from './composables/useScanner.js'; // New import
import { useRouteManagement } from './composables/useRouteManagement.js'; // New import
import { useNotification } from './composables/useNotification.js';
import { useMenuEditor } from './composables/useMenuEditor.js';
import { useModal } from './composables/useModal.js';
import { useMaintenance } from './composables/useMaintenance.js';
import KanbanColumn from './components/KanbanColumn.js';
import NavButton from './components/NavButton.js';
import TabRec from './components/TabRec.js';
import OrderDetailForm from './components/OrderDetailForm.js';
import TabScanner from './components/TabScanner.js';
import TabRoutes from './components/TabRoutes.js';
import StationBoard from './components/StationBoard.js';
import TabKitchen from './components/TabKitchen.js';
import TabGrill from './components/TabGrill.js';
import TabMenu from './components/TabMenu.js';
import { AudioProcessor } from './audio-processor.js';
import { PIZZA_MENU, INGREDIENT_PRICES, parseExtrasString } from './parser.js';
import { saveOrder, getAllOrders, updateOrder, archiveOrder } from './storage.js';
import { formatTime, formatQty } from './utils.js';

const { createApp, ref, onMounted, onBeforeUnmount, watch, computed } = Vue;

const app = createApp({
    setup() {
        // --- Globální navigace (Záložky) ---
        const currentTab = ref('rec'); // 'rec', 'kitchen', 'grill', 'scanner', 'routes', 'menu'
        const dbOrders = ref([]);

        // --- UI State & PWA ---
        const debugLogs = ref([]);
        const updateAvailable = ref(false);
        const canInstall = ref(false);
        const volume = ref(0);

        // --- Theme Logic ---
        const getSystemTheme = () => window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        const currentTheme = ref(localStorage.getItem('gastrohub_theme') || getSystemTheme());
        
        const applyTheme = (theme) => {
            document.documentElement.setAttribute('data-theme', theme);
        };

        const toggleTheme = () => {
            currentTheme.value = currentTheme.value === 'light' ? 'dark' : 'light';
            // Manually saving to localStorage acts as a user override
            localStorage.setItem('gastrohub_theme', currentTheme.value);
            applyTheme(currentTheme.value);
            logToSandbox(`Režim zobrazení změněn na: ${currentTheme.value === 'dark' ? 'Tmavý' : 'Světlý'}`, 'info');
        };

        // --- PWA Installation Logic ---
        let deferredPrompt = null;
        window.addEventListener('beforeinstallprompt', (e) => {
            // Prevent the mini-infobar from appearing on mobile
            e.preventDefault();
            // Stash the event so it can be triggered later.
            deferredPrompt = e;
            // Update UI notify the user they can install the PWA
            canInstall.value = true;
        });

        window.addEventListener('appinstalled', () => {
            canInstall.value = false;
            deferredPrompt = null;
            logToSandbox("Aplikace byla úspěšně nainstalována.", "success");
        });

        // --- Inicializace Composables pro příjem hlasu ---
        const logToSandbox = (msg, type = 'log', action = null) => {
            debugLogs.value.unshift({ 
                time: new Date().toLocaleTimeString(), 
                msg, 
                type,
                action: action ? { label: 'Opakovat', callback: action } : null
            });
        };

        // --- Data Synchronization Logic ---
        const loadGlobalOrders = async () => {
            try {
                const data = await getAllOrders();
                if (Array.isArray(data)) {
                    dbOrders.value = data.sort((a, b) => {
                        const sortA = a.sort_order || new Date(a.created_at).getTime();
                        const sortB = b.sort_order || new Date(b.created_at).getTime();
                        return sortA - sortB;
                    });
                }
            } catch (err) {
                logToSandbox("Chyba synchronizace DB: " + err.message, 'error', loadGlobalOrders);
            }
        };

        const modal = useModal();

        const ctx = {
            log: logToSandbox,
            dbOrders: dbOrders,
            loadOrders: loadGlobalOrders,
            modal: modal
        };

        // --- Domain Logic Composables ---
        const menuEditor = useMenuEditor(ctx);

        // Combine static PIZZA_MENU with dynamic menu items from the editor
        const allMenuItems = computed(() => {
            const dynamicItems = menuEditor.menuItems?.value || [];
            return [...PIZZA_MENU, ...dynamicItems];
        });

        const orderManager = useOrderManager(ctx, allMenuItems);

        // Enhanced Speech Recognition Integration
        const speech = useSpeechRecognition(
            (interim) => {
                orderManager.handleInterimTranscript(interim);
            },
            async (final) => {
                const commandResult = await orderManager.handleFinalResult(final);
                if (commandResult === "RESET_TRIGGERED" || commandResult === "SAVE_TRIGGERED") {
                    speech.resetTranscript();
                }
            },
            logToSandbox,
            orderManager.isProcessing
        );

        // --- Integrace nových composables ---
        const { speak } = useSpeech(); // For general alerts
        const kitchenStation = useKitchenStation(ctx);
        const scanner = useScanner(ctx); // Assuming scanner doesn't need dbOrders directly for its core function
        const routeManagement = useRouteManagement(ctx);
        const notification = useNotification();
        const maintenance = useMaintenance(ctx);

        // --- Mobile Optimization: Screen Wake Lock ---
        let wakeLock = null;
        const requestWakeLock = async () => {
            if ('wakeLock' in navigator) {
                try {
                    wakeLock = await navigator.wakeLock.request('screen');
                } catch (err) {
                    console.error(`${err.name}, ${err.message}`);
                }
            }
        };

        const releaseWakeLock = () => {
            if (wakeLock !== null) {
                wakeLock.release();
                wakeLock = null;
            }
        };

        // Re-request wake lock when page becomes visible again
        document.addEventListener('visibilitychange', () => {
            if (wakeLock !== null && document.visibilityState === 'visible') requestWakeLock();
        });

        // --- Audio Visualizer Setup ---
        const audioProcessor = new AudioProcessor();

        watch(speech.isListening, async (listening) => {
            if (listening) {
                try {
                    await audioProcessor.start((v) => {
                        volume.value = v;
                    });
                } catch (err) {
                    speech.stop();
                    logToSandbox("Přístup k mikrofonu odmítnut nebo selhal: " + err.message, "error");
                }
            } else {
                audioProcessor.stop();
                volume.value = 0;
            }
        });

        // --- PWA Update Lifecycle (2026 Best Practice) ---
        let waitingWorker = null;

        const refreshApp = () => {
            if (waitingWorker) {
                waitingWorker.postMessage({ type: 'SKIP_WAITING' });
            }
        };

        // Handle background update notifications from Service Worker
        if ('serviceWorker' in navigator) {
            // Register and monitor the Service Worker lifecycle
            navigator.serviceWorker.register('./sw.js').then(reg => {
                // Periodic background check for updates on mobile
                setInterval(() => { reg.update(); }, 60 * 60 * 1000); // Every hour

                if (reg.waiting) {
                    waitingWorker = reg.waiting;
                    updateAvailable.value = true;
                }

                reg.onupdatefound = () => {
                    const newWorker = reg.installing;
                    newWorker.onstatechange = () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            waitingWorker = newWorker;
                            updateAvailable.value = true;
                        }
                    };
                };
            });

            // Handle connection recovery
            window.addEventListener('online', () => {
                logToSandbox("Připojení obnoveno.", "success");
                loadGlobalOrders();
            });

            navigator.serviceWorker.addEventListener('message', (event) => {
                if (event.data?.type === 'RESOURCE_UPDATED') {
                    logToSandbox(`Aktualizace: ${event.data.url.split('/').pop()} byl aktualizován na pozadí.`, 'info');
                    notification.trigger(6000); // Show UI notification
                }
            });

            // Reload the page automatically when the new worker takes control
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                window.location.reload();
            });
        }

        const handleReorder = async ({ draggedId, targetId }) => {
            const draggedOrder = dbOrders.value.find(o => o.id === draggedId);
            const targetOrder = dbOrders.value.find(o => o.id === targetId);
            
            if (draggedOrder && targetOrder) {
                // Swap sort_order values to persist the new manual sequence
                const tempSort = draggedOrder.sort_order || new Date(draggedOrder.created_at).getTime();
                draggedOrder.sort_order = targetOrder.sort_order || new Date(targetOrder.created_at).getTime();
                targetOrder.sort_order = tempSort;

                await Promise.all([updateOrder(draggedOrder), updateOrder(targetOrder)]);
                await loadGlobalOrders();
            }
        };

        const installApp = async () => {
            if (!deferredPrompt) return;
            // Show the install prompt
            deferredPrompt.prompt();
            // Wait for the user to respond to the prompt
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                logToSandbox('Uživatel přijal instalaci.', 'success');
            }
            // We've used the prompt, and can't use it again
            deferredPrompt = null;
            canInstall.value = false;
        };

        const updateSettings = ({ pizza, grill }) => {
            localStorage.setItem('gastrohub_pizza_capacity', pizza);
            localStorage.setItem('gastrohub_grill_capacity', grill);
            // Update reactive refs in kitchenStation
            kitchenStation.pizzaCapacity.value = parseInt(pizza);
            kitchenStation.grillCapacity.value = parseInt(grill);
            // No need to update turbo mode here, it's handled by its own toggle
            modal.success("Nastavení uloženo", "Kapacity stanic byly úspěšně aktualizovány.");
        };

        // Watch for changes in orderManager's orders to trigger a global reload
        // This ensures the main app's dbOrders is always in sync with what orderManager saves.
        watch(() => orderManager.orders, loadGlobalOrders, { deep: true });

        // Automatically refresh data when switching to status-critical tabs
        watch(currentTab, (newTab, oldTab) => {
            const criticalTabs = ['kitchen', 'grill', 'routes'];
            const isNewCritical = criticalTabs.includes(newTab);
            const isOldCritical = criticalTabs.includes(oldTab);

            if (isNewCritical && !isOldCritical) {
                loadGlobalOrders();
            }

            // Auto-stop recognition when leaving the recording tab to save battery
            if (oldTab === 'rec' && newTab !== 'rec') {
                speech.stop();
            }
        });

        onMounted(() => {
            loadGlobalOrders();
            maintenance.runMaintenance();
            applyTheme(currentTheme.value);
        });

        // --- Extras Selection Modal Logic ---
        const extrasModal = ref({
            show: false,
            item: null,
            selection: [],
            isEditing: false, 
            editingItemIndex: null 
        });

        return {
            currentTab, dbOrders, currentTheme, debugLogs, volume, updateAvailable, canInstall,
            formatTime, handleReorder, toggleTheme, refreshApp, installApp, updateSettings,
            ...kitchenStation, ...scanner, ...routeManagement, ...orderManager, ...speech, ...menuEditor,
            notification, modal, INGREDIENT_PRICES, extrasModal, speak,
            menuItems: allMenuItems,
            addItemToOrder: (item) => {
                if (item.category === 'pizza' || item.category === 'grill') {
                    extrasModal.value = { show: true, item, selection: [], isEditing: false, editingItemIndex: null };
                } else orderManager.addItemToOrder(item);
            },
            openEditExtrasModal: (item, index) => {
                extrasModal.value = { show: true, item, selection: parseExtrasString(item.extras), isEditing: true, editingItemIndex: index };
            },
            confirmExtras: () => {
                const { item, selection, isEditing, editingItemIndex } = extrasModal.value;
                const price = selection.reduce((acc, n) => acc + (INGREDIENT_PRICES[n] || 0), 0);
                const str = selection.length ? selection.map(n => `➕ ${n}`).join(", ") : "";
                isEditing ? orderManager.updateItemExtras(editingItemIndex, str, price) : orderManager.addItemToOrder(item, str, price);
                extrasModal.value.show = false;
            }
        };
    }
});

app.component('nav-button', NavButton);
app.component('kanban-column', KanbanColumn);
app.component('station-board', StationBoard);
app.component('tab-rec', TabRec);
app.component('tab-kitchen', TabKitchen);
app.component('tab-grill', TabGrill);
app.component('tab-scanner', TabScanner);
app.component('tab-routes', TabRoutes);
app.component('tab-menu', TabMenu);

app.mount('#app');