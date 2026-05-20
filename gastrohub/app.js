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
import { PIZZA_MENU } from './parser.js';
import { saveOrder, getAllOrders, updateOrder, archiveOrder } from './storage.js';
import { formatTime, formatQty } from './utils.js';

const { createApp, ref, onMounted, onBeforeUnmount, watch, computed } = Vue;

const app = createApp({
    setup() {
        // --- Globální navigace (Záložky) ---
        const currentTab = ref('rec'); // 'rec', 'kitchen', 'grill', 'scanner', 'routes', 'menu'
        const dbOrders = ref([]);

        // --- Inicializace Composables pro příjem hlasu ---
        const debugLogs = ref([]);
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

        // --- Audio Visualizer Setup ---
        const volume = ref(0);
        const audioProcessor = new AudioProcessor();

        watch(speech.isListening, async (listening) => {
            if (listening) {
                await audioProcessor.start((v) => {
                    volume.value = v;
                });
            } else {
                audioProcessor.stop();
                volume.value = 0;
            }
        });

        // --- PWA Update Lifecycle (2026 Best Practice) ---
        const updateAvailable = ref(false);
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
                // Check if a worker is already waiting from a previous load
                if (reg.waiting) {
                    waitingWorker = reg.waiting;
                    updateAvailable.value = true;
                }

                // Detect new updates found in the background
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
        watch(currentTab, (newTab) => {
            if (['kitchen', 'grill', 'routes'].includes(newTab)) {
                loadGlobalOrders();
            }
        });

        onMounted(() => {
            loadGlobalOrders();
            // Perform startup maintenance
            maintenance.runMaintenance();
        });

        onBeforeUnmount(() => {
            // Composables handle their own cleanup
        });

        return {
            currentTab,
            dbOrders,
            formatTime,
            handleReorder,
            debugLogs,
            ...kitchenStation,
            // Scanner
            ...scanner,
            updateSettings,
            // Routes
            ...routeManagement,
            // Notifications
            notification,
            // Modal
            modal,
            // Hlasové proxy passthrough
            ...orderManager,
            ...speech, // Speech recognition
            speak, // Speech synthesis for general alerts
            // Update State
            updateAvailable,
            volume,
            refreshApp,
            // Menu Editor & Merged items
            ...menuEditor,
            menuItems: allMenuItems // Ensure allMenuItems takes precedence over menuEditor.menuItems
        };
    }
});

/**
 * Navigation Button Component
 */
app.component('NavButton', {
    props: ['id', 'activeTab', 'label', 'count'],
    emits: ['navigate'],
    template: `
        <button class="nav-btn" 
                :class="{ active: activeTab === id }" 
                @click="$emit('navigate', id)">
            {{ label }} <span v-if="count !== undefined && count !== null">({{ count }})</span>
        </button>
    `
});

app.component('KanbanColumn', KanbanColumn);

/**
 * Tab Components for Dynamic Rendering
 */
app.component('tab-rec', {
    props: ['isListening', 'transcript', 'interimTranscript', 'currentOrder', 'volume', 'menuItems'],
    emits: ['toggle-listening', 'confirm-order', 'add-item', 'reset-order'],
    computed: {
        groupedMenu() {
            // Resilience check: handle potential missing or non-array prop
            const items = Array.isArray(this.menuItems) ? this.menuItems : [];
            
            const usage = (() => {
                try {
                    return JSON.parse(localStorage.getItem('gastrohub_item_stats') || '{}');
                } catch (e) { return {}; }
            })();
            
            const groups = {
                frequent: { label: '⭐ Časté', items: [] },
                pizza: { label: '🍕 Pizzy', items: [] },
                grill: { label: '🥩 Gril', items: [] }
            };

            if (items.length > 0) {
                // Identify top 4 most frequent items
                groups.frequent.items = [...items]
                    .filter(item => usage[item.name] > 0)
                    .sort((a, b) => (usage[b.name] || 0) - (usage[a.name] || 0))
                    .slice(0, 4);
                
                // Zobrazit sekci Časté pouze pokud obsahuje alespoň 2 položky
                if (groups.frequent.items.length < 2) {
                    groups.frequent.items = [];
                }

                items.forEach(item => {
                    const cat = item.category === 'grill' ? 'grill' : 'pizza';
                    if (groups[cat]) groups[cat].items.push(item);
                });
            }

            return groups;
        }
    },
    methods: { formatQty },
    template: `
        <section class="card">
            <h3>🎙️ Hlasový Zápisník</h3>
            <div style="display: flex; align-items: center; gap: 20px;">
                <button @click="$emit('toggle-listening')" :style="{ background: isListening ? '#e74c3c' : '#e67e22', color: 'white', border: 'none', padding: '15px 30px', borderRadius: '25px', fontSize: '1.1rem', cursor: 'pointer', margin: '15px 0' }">
                    {{ isListening ? '🛑 Zastavit nahrávání' : '🎙️ Spustit diktování' }}
                </button>
                
                <!-- Volume Meter -->
                <div v-if="isListening" style="flex-grow: 1; height: 12px; background: #ecf0f1; border-radius: 6px; overflow: hidden; max-width: 200px;">
                    <div :style="{ width: volume + '%', background: '#2ed573', height: '100%', transition: 'width 0.1s ease' }"></div>
                </div>
            </div>

            <div class="output-panel" style="min-height: 100px; background: #fafafa; border: 1px solid #d1d5db; border-radius: 8px; padding: 12px; text-align: left; margin-bottom: 15px; font-size: 1.1rem;">
                <span style="color: #1f2937;">{{ transcript }}</span>
                <span style="color: #9ca3af; font-style: italic;"> {{ interimTranscript }}</span>
                <div v-if="!transcript && !interimTranscript" style="color: #9ca3af;">Zde se objeví váš text...</div>
            </div>

            <div style="margin: 15px 0; text-align: left;">
                <h4 style="margin-bottom: 15px; font-size: 0.95rem; color: #7f8c8d;">Rychlý výběr z menu:</h4>
                <div v-for="(group, key) in groupedMenu" :key="key" :style="key === 'frequent' && group.items.length > 0 ? { background: '#fff9db', padding: '12px', borderRadius: '12px', border: '1px dashed #f1c40f', marginBottom: '20px' } : { marginBottom: '20px' }">
                    <div v-if="group.items.length > 0">
                        <div style="font-size: 0.75rem; font-weight: bold; text-transform: uppercase; color: #95a5a6; margin-bottom: 8px; letter-spacing: 0.5px; border-bottom: 1px solid #eee; padding-bottom: 4px;">{{ group.label }}</div>
                        <div style="display: flex; gap: 10px; overflow-x: auto; padding-bottom: 10px; white-space: nowrap;">
                            <button v-for="item in group.items" :key="item.id" @click="$emit('add-item', item)" style="background: white; border: 1px solid #ddd; padding: 10px 20px; border-radius: 25px; cursor: pointer; font-size: 1rem; display: flex; align-items: center; gap: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); flex-shrink: 0;">
                                <span>{{ item.category === 'grill' ? '🥩' : '🍕' }}</span> {{ item.name }}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            
            <div style="background: #f1f2f6; padding: 15px; border-radius: 6px; margin-top: 15px; text-align: left;">
                <h4>Aktuálně zpracovávaný detail</h4>

                <!-- Itemized Price Breakdown -->
                <div v-if="currentOrder.items && currentOrder.items.length > 0" style="margin: 10px 0; background: white; padding: 10px; border-radius: 6px; border: 1px solid #ddd; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);">
                    <div v-for="(item, idx) in currentOrder.items" :key="idx" style="font-size: 0.85rem; margin-bottom: 8px; border-bottom: 1px dashed #eee; padding-bottom: 6px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; font-weight: 600;">
                            <span>{{ formatQty(item.quantity) }}x {{ item.name }}</span>
                            <span>{{ ((item.price || 0) + (item.extrasPrice || 0)) * (item.quantity || 1) }} Kč</span>
                        </div>
                        <div v-if="item.extras" style="font-size: 0.75rem; color: #d35400; margin-left: 10px; margin-top: 2px;">
                            + {{ item.extras }} (+{{ item.extrasPrice }} Kč)
                        </div>
                        <div style="font-size: 0.75rem; color: #7f8c8d; margin-left: 10px;">
                            Cena/ks: {{ item.price }} Kč
                        </div>
                    </div>
                </div>

                <div style="margin-bottom: 10px;">
                    <label style="display:block; font-size: 0.8rem; color: #666;">Položka:</label>
                    <input v-model="currentOrder.item" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" placeholder="Zadejte položku...">
                </div>
                <div style="margin-bottom: 10px;">
                    <label style="display:block; font-size: 0.8rem; color: #666;">Adresa:</label>
                    <input v-model="currentOrder.address" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" placeholder="Zadejte adresu...">
                </div>
                <div style="margin-bottom: 15px;">
                    <label style="display:block; font-size: 0.8rem; color: #666;">Telefon:</label>
                    <input v-model="currentOrder.phone" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" placeholder="Zadejte telefon...">
                </div>
                <p style="font-size: 0.9rem;"><b>Stanice:</b> {{ currentOrder?.category === 'grill' ? '🥩 Gril' : '🍕 Pizza' }}</p>
                <p style="font-size: 1.1rem; font-weight: bold; color: #2c3e50;">Celkem: {{ currentOrder?.price || 0 }} Kč</p>
                <div style="display: flex; gap: 10px;">
                    <button @click="$emit('reset-order')" style="background: #95a5a6; color: white; border: none; padding: 10px 20px; font-weight: bold; flex: 1; border-radius: 4px; cursor: pointer;">🗑️ Vymazat</button>
                    <button @click="$emit('confirm-order')" style="background: #2ed573; color: white; border: none; padding: 10px 20px; font-weight: bold; flex: 2; border-radius: 4px; cursor: pointer;">💾 Schválit do výroby</button>
                </div>
            </div>
        </section>
    `
});

app.component('tab-kitchen', {
    props: ['pendingPizzaOrders', 'bakingPizzaOrders', 'completedPizzaOrders', 'formatTime', 'pizzaActiveCount', 'pizzaCapacity', 'isTurboMode', 'pizzaCapacityReached'],
    emits: ['start-pizza-baking', 'finish-pizza-baking', 'reorder'],
    template: `
        <station-board 
            category="pizza"
            :pending-orders="pendingPizzaOrders"
            :cooking-orders="bakingPizzaOrders"
            :completed-orders="completedPizzaOrders"
            :active-count="pizzaActiveCount"
            :capacity="pizzaCapacity"
            :is-turbo-mode="isTurboMode"
            :capacity-reached="pizzaCapacityReached"
            :format-time="formatTime"
            :labels="{ pending: '⏳ K pečení (Pec)', cooking: '🔥 V peci', done: '✅ Hotovo', startBtn: '🔥 Sázet do pece', finishBtn: '✅ Vyndat' }"
            @start-action="p => $emit('start-pizza-baking', p.order, p.item)"
            @finish-action="p => $emit('finish-pizza-baking', p.order, p.item)"
            @reorder="$e => $emit('reorder', $e)"
        />
    `
});

app.component('tab-grill', {
    props: ['pendingGrillOrders', 'grillingOrders', 'completedGrillOrders', 'formatTime', 'grillActiveCount', 'grillCapacity', 'isTurboMode', 'grillCapacityReached'],
    emits: ['start-grilling', 'finish-grilling', 'reorder'],
    template: `
        <station-board 
            category="grill"
            :pending-orders="pendingGrillOrders"
            :cooking-orders="grillingOrders"
            :completed-orders="completedGrillOrders"
            :active-count="grillActiveCount"
            :capacity="grillCapacity"
            :is-turbo-mode="isTurboMode"
            :capacity-reached="grillCapacityReached"
            :format-time="formatTime"
            :labels="{ pending: '⏳ K přípravě (Gril)', cooking: '🥩 Na roštu', done: '📦 Expedice Gril', startBtn: '🥩 Položit na gril', finishBtn: '✅ Hotovo' }"
            @start-action="p => $emit('start-grilling', p.order, p.item)"
            @finish-action="p => $emit('finish-grilling', p.order, p.item)"
            @reorder="$e => $emit('reorder', $e)"
        />
    `
});

app.component('tab-menu', {
    props: ['pizzaCapacity', 'grillCapacity', 'isTurboMode'],
    emits: ['update-settings', 'toggle-turbo-mode'],
    data() {
        return {
            localPizza: this.pizzaCapacity,
            localGrill: this.grillCapacity
        };
    },
    template: `
        <section class="card">
            <h3>⚙️ Nastavení Systému</h3>
            <div style="background: #f8f9fa; padding: 25px; border-radius: 12px; border: 1px solid #e1e8ed; margin-bottom: 25px;">
                <h4 style="margin-top: 0; color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px; display: inline-block;">Kapacita Výroby</h4>
                <p style="font-size: 0.9rem; color: #7f8c8d; margin-bottom: 20px;">Nastavte maximální počet položek, které lze současně zpracovávat v peci nebo na grilu.</p>
                
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 25px;">
                    <div class="form-group">
                        <label style="display: block; font-weight: bold; margin-bottom: 8px;">🍕 Limit Pece (Pizzy)</label>
                        <input type="number" v-model="localPizza" class="input-field" style="width: 100%; font-size: 1.2rem; text-align: center; border: 2px solid #ddd; border-radius: 8px; padding: 10px;">
                    </div>
                    <div class="form-group">
                        <label style="display: block; font-weight: bold; margin-bottom: 8px;">🥩 Limit Grilu (Položky)</label>
                        <input type="number" v-model="localGrill" class="input-field" style="width: 100%; font-size: 1.2rem; text-align: center; border: 2px solid #ddd; border-radius: 8px; padding: 10px;">
                    </div>
                </div>

                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
                    <h4 style="margin-top: 0; color: #2c3e50; border-bottom: 2px solid #e74c3c; padding-bottom: 10px; display: inline-block;">Režim Turbo</h4>
                    <p style="font-size: 0.9rem; color: #7f8c8d; margin-bottom: 20px;">
                        V režimu Turbo jsou ignorovány limity kapacity pece a grilu. Použijte pouze ve špičce!
                    </p>
                    <button @click="$emit('toggle-turbo-mode')" :class="['action-btn-danger', { 'action-btn-success': isTurboMode }]" style="width: 100%; padding: 15px; font-size: 1.1rem;">
                        {{ isTurboMode ? '✅ Režim Turbo ZAPNUTÝ' : '❌ Režim Turbo VYPNUTÝ' }}
                    </button>
                </div>
                
                <button @click="$emit('update-settings', { pizza: localPizza, grill: localGrill })" class="action-btn-success" style="margin-top: 30px; width: 100%; padding: 15px; font-size: 1.1rem;">
                    💾 Uložit konfiguraci
                </button>
            </div>
        </section>
    `
});

app.mount('#app');