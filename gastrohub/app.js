// app.js
import { useSpeechRecognition } from './composables/useSpeechRecognition.js';
import { useOrderManager } from './composables/useOrderManager.js';
import { useSpeech } from './composables/useSpeech.js'; // New import
import { useKitchenStation } from './composables/useKitchenStation.js'; // New import
import { useScanner } from './composables/useScanner.js'; // New import
import { useRouteManagement } from './composables/useRouteManagement.js'; // New import
import { useNotification } from './composables/useNotification.js';
import { useMenuEditor } from './composables/useMenuEditor.js';
import { useModal } from './composables/useModal.js';
import { useMaintenance } from './composables/useMaintenance.js';
import { AudioProcessor } from './audio-processor.js';
import { PIZZA_MENU } from './parser.js';
import { saveOrder, getAllOrders, updateOrder, archiveOrder } from './storage.js';

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
        const scanner = useScanner(ctx);
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

                await updateOrder(JSON.parse(JSON.stringify(draggedOrder)));
                await updateOrder(JSON.parse(JSON.stringify(targetOrder)));
                await loadGlobalOrders();
            }
        };

        const formatTime = (seconds) => {
            if (seconds <= 0) return "🔥 HOTOVO";
            const m = Math.floor(seconds / 60);
            const s = seconds % 60;
            return `${m}:${s.toString().padStart(2, '0')}`;
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
            loadGlobalOrders,
            formatTime,
            handleReorder,
            debugLogs,
            // Kitchen Station
            ...kitchenStation,
            // Scanner
            ...scanner,
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

/**
 * Reusable Kanban Column Component
 * Handles state visualization for both Pizza and Grill stations.
 */
app.component('KanbanColumn', {
    props: {
        title: { type: String, required: true },
        orders: { type: Array, default: () => [] },
        category: { 
            type: String, 
            required: true,
            validator: value => ['pizza', 'grill'].includes(value)
        },
        status: { type: String, required: true },
        buttonText: { type: String, default: 'Akce' },
        buttonClass: { type: String, default: '' },
        formatTime: { type: Function, default: (s) => s > 0 ? `${Math.floor(s/60)}:${(s%60).toString().padStart(2,'0')}` : "0:00" }
    },
    emits: ['action', 'reorder'],
    template: `
        <div class="col" :class="'font-' + status">
            <h4>{{ title }}</h4>
            <div v-for="order in orders" :key="order.id" class="item-card"
                 draggable="true"
                 @dragstart="handleDragStart($event, order.id)"
                 @dragover.prevent
                 @drop="handleDrop($event, order.id)"
                 :class="{ 'target-done': status === 'done' }" 
                 :style="status !== 'done' ? { borderLeft: '5px solid ' + (category === 'pizza' ? '#e67e22' : '#c0392b') } : {}">
                
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                    <span style="font-weight: bold; color: #7f8c8d; font-size: 0.8rem;">#{{ order.id }}</span>
                    <div v-if="status !== 'done'" style="font-size: 1.2rem;">
                        {{ category === 'pizza' ? '🍕' : '🥩' }}
                    </div>
                </div>
                
                <h5 style="margin-top: 5px;">{{ order.item }}</h5>
                <div style="font-weight: bold; color: #2d3436; margin-bottom: 8px;">{{ order.price }} Kč</div>
                
                <div v-if="status === 'pizza' || status === 'grill'" style="font-size: 0.8rem; color: #7f8c8d; margin-bottom: 10px;">
                    Čekání na slot: {{ formatTime(order.estimatedWait || 0) }}
                </div>

                <template v-if="status === 'baking' || status === 'grilling'">
                    <div class="timer" :style="category === 'grill' ? { color: '#c0392b' } : {}">
                        {{ formatTime(category === 'pizza' ? order.pizzaRemaining : order.grillRemaining) }}
                    </div>
                    <div class="progress-container">
                        <div :class="['progress-bar', { grill: category === 'grill', 'progress-warning': getProgress(order) >= 80 && getProgress(order) < 100, 'progress-ready': getProgress(order) >= 100 }]" 
                             :style="{ width: getProgress(order) + '%' }"></div>
                    </div>
                </template>

                <button v-if="status !== 'done'" :class="buttonClass" @click="$emit('action', order)">
                    {{ buttonText }}
                </button>
            </div>
        </div>
    `,
    methods: {
        getProgress(order) {
            return (this.category === 'pizza' ? order.pizzaProgress : order.grillProgress) || 0;
        },
        handleDragStart(event, orderId) {
            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData('text/plain', orderId);
        },
        handleDrop(event, targetId) {
            const draggedId = parseInt(event.dataTransfer.getData('text/plain'));
            if (draggedId && draggedId !== targetId) {
                this.$emit('reorder', { draggedId, targetId });
            }
        }
    }
});

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
    props: ['pendingPizzaOrders', 'bakingPizzaOrders', 'completedPizzaOrders', 'formatTime'],
    emits: ['start-pizza-baking', 'finish-pizza-baking', 'reorder'],
    template: `
        <section class="station-grid">
            <kanban-column title="⏳ K pečení (Pec)" :orders="pendingPizzaOrders" category="pizza" status="pizza" button-text="🔥 Sázet do pece" button-class="action-btn-pizza" :format-time="formatTime" @action="$emit('start-pizza-baking', $event)" @reorder="$emit('reorder', $event)"></kanban-column>
            <kanban-column title="🔥 V peci" :orders="bakingPizzaOrders" category="pizza" status="baking" button-text="✅ Vyndat" button-class="action-btn-success" :format-time="formatTime" @action="$emit('finish-pizza-baking', $event)"></kanban-column>
            <kanban-column title="📦 Hotovo" :orders="completedPizzaOrders" category="pizza" status="done" :format-time="formatTime"></kanban-column>
        </section>
    `
});

app.component('tab-grill', {
    props: ['pendingGrillOrders', 'grillingOrders', 'completedGrillOrders', 'formatTime'],
    emits: ['start-grilling', 'finish-grilling', 'reorder'],
    template: `
        <section class="station-grid">
            <kanban-column title="⏳ K přípravě (Gril)" :orders="pendingGrillOrders" category="grill" status="grill" button-text="🥩 Položit na gril" button-class="action-btn-grill" :format-time="formatTime" @action="$emit('start-grilling', $event)" @reorder="$emit('reorder', $event)"></kanban-column>
            <kanban-column title="🥩 Na roštu" :orders="grillingOrders" category="grill" status="grilling" button-text="✅ Hotovo" button-class="action-btn-success" :format-time="formatTime" @action="$emit('finish-grilling', $event)"></kanban-column>
            <kanban-column title="📦 Expedice Gril" :orders="completedGrillOrders" category="grill" status="done" :format-time="formatTime"></kanban-column>
        </section>
    `
});

app.component('tab-scanner', {
    props: ['isScannerActive', 'scannerError'],
    emits: ['start-scanner', 'stop-scanner'],
    template: `
        <section class="card" style="text-align: center;">
            <h3>📷 Hardwarový Scanner kódů</h3>
            <div style="margin: 15px 0;">
                <button v-if="!isScannerActive" @click="$emit('start-scanner')" style="background: #2c3e50; color: white; padding: 12px 24px; border:none; border-radius:4px; cursor:pointer;">Aktivovat kameru</button>
                <button v-else @click="$emit('stop-scanner')" style="background: #7f8c8d; color: white; padding: 12px 24px; border:none; border-radius:4px; cursor:pointer;">Vypnout kameru</button>
            </div>
            
            <div v-if="isScannerActive" style="position: relative; max-width: 400px; margin: 0 auto; background: #000; border-radius: 8px; overflow: hidden;">
                <video id="scanner-preview" style="width: 100%; height: auto; display: block;"></video>
                <div style="position: absolute; top: 50%; left: 50%; transform: translate(-25px, -25px); width: 50px; height: 50px; border: 2px dashed #e67e22;"></div>
            </div>

            <div v-if="scannerError" style="color: #c0392b; margin-top: 10px;">{{ scannerError }}</div>
        </section>
    `
});

app.component('tab-routes', {
    props: ['unassignedOrders', 'couriers', 'routes', 'selectedOrderIds'],
    emits: ['create-route', 'toggle-order-selection'],
    template: `
        <section class="card">
            <h3>🗺️ Logistika a expedice tras</h3>
            <p>Hotová jídla připravená k odběru: <b>{{ unassignedOrders.length }} ks</b></p>

            <div v-if="unassignedOrders.length > 0" style="margin: 15px 0;">
                <p style="font-size: 0.9rem; color: #7f8c8d; margin-bottom: 10px;">Vyberte objednávky pro trasu:</p>
                <div style="display: grid; gap: 8px; max-height: 200px; overflow-y: auto; padding: 5px; border: 1px solid #eee; border-radius: 4px;">
                    <div v-for="order in unassignedOrders" :key="order.id" 
                         @click="$emit('toggle-order-selection', order.id)"
                         :style="{ padding: '10px', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer', background: selectedOrderIds.includes(order.id) ? '#d1f2eb' : 'white', transition: 'background 0.2s' }">
                        <input type="checkbox" :checked="selectedOrderIds.includes(order.id)" style="margin-right: 10px;">
                        <b>#{{ order.id }}</b> — {{ order.item }} — <small>{{ order.address }}</small>
                    </div>
                </div>
            </div>
            
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px; margin-top: 15px;">
                <div v-for="courier in couriers" :key="courier.id" style="background: #f1f2f6; padding: 15px; border-radius: 6px; border: 1px solid #dcdde1;">
                    <h5>🚚 {{ courier.name }}</h5>
                    <p>Stav: <span style="color: #2ed573; font-weight: bold;">{{ courier.status }}</span></p>
                    <button @click="$emit('create-route', courier)" :disabled="selectedOrderIds.length === 0" style="background: #2c3e50; color: white; border: none; padding: 8px 12px; width: 100%; border-radius: 4px; cursor: pointer;">
                        🗺️ Generovat trasu ({{ selectedOrderIds.length }})
                    </button>
                </div>
            </div>

            <div v-if="routes.length > 0" style="margin-top: 25px;">
                <h4>Aktivní trasy kurýrů na mapě</h4>
                <div v-for="route in routes" :key="route.id" style="background: #e8f4fd; padding: 10px; margin-bottom: 8px; border-left: 4px solid #3498db; font-size: 0.9rem;">
                    <b>Trasa #{{ route.id }}</b> — řidič: {{ route.courierName }} ({{ route.ordersCount }} ks) — <b style="color: #2c3e50;">Hodnota: {{ route.totalValue }} Kč</b> — <i>Stav: {{ route.status }}</i>
                </div>
            </div>
        </section>
    `
});

app.mount('#app');