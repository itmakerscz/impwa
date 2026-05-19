// composables/useKitchenStation.js
import { updateOrder } from '../storage.js';
import { useSpeech } from './useSpeech.js';

const { computed, ref, onMounted, onBeforeUnmount } = Vue;

export function useKitchenStation({ dbOrders, loadOrders }) {
    const { speak } = useSpeech();
    let tickerInterval = null;
    let kitchenWorker = null;
    const STATION_CAPACITY = 8;

    // Computed properties for filtering orders by status and type
    const pendingPizzaOrders = computed(() => dbOrders.value.filter(o => (!o.status || o.status === 'pending') && o.category === 'pizza'));
    const bakingPizzaOrders = computed(() => dbOrders.value.filter(o => o.status === 'baking'));
    const completedPizzaOrders = computed(() => dbOrders.value.filter(o => o.status === 'completed_pizza'));

    const pendingGrillOrders = computed(() => dbOrders.value.filter(o => (!o.status || o.status === 'pending') && o.category === 'grill'));
    const grillingOrders = computed(() => dbOrders.value.filter(o => o.status === 'grilling'));
    const completedGrillOrders = computed(() => dbOrders.value.filter(o => o.status === 'completed_grill'));

    // Action: Start Pizza Baking
    const startPizzaBaking = async (order) => {
        const updatedOrder = {
            ...order,
            status: 'baking',
            pizzaTotal: order.prepTime || 300,
            pizzaStartedAt: Date.now()
        };
        await updateOrder(updatedOrder);
        await loadOrders(); // Refresh global orders
    };

    // Action: Finish Pizza Baking
    const finishPizzaBaking = async (order) => {
        const updatedOrder = {
            ...order,
            status: 'completed_pizza'
        };
        await updateOrder(updatedOrder);
        await loadOrders(); // Refresh global orders
    };

    // Action: Start Grilling
    const startGrilling = async (order) => {
        const updatedOrder = {
            ...order,
            status: 'grilling',
            grillTotal: order.prepTime || 420,
            grillStartedAt: Date.now()
        };
        await updateOrder(updatedOrder);
        await loadOrders(); // Refresh global orders
    };

    // Action: Finish Grilling
    const finishGrilling = async (order) => {
        const updatedOrder = {
            ...order,
            status: 'completed_grill'
        };
        await updateOrder(updatedOrder);
        await loadOrders(); // Refresh global orders
    };

    const startKitchenTicker = () => {
        // Inicializace Web Workeru
        kitchenWorker = new Worker(new URL('../kitchen-worker.js', import.meta.url));

        kitchenWorker.onmessage = (e) => {
            const { updatedOrders, alerts } = e.data;
            
            // Synchronizace vypočtených dat zpět do reaktivního pole
            updatedOrders.forEach(newO => {
                const oldO = dbOrders.value.find(o => o.id === newO.id);
                if (oldO) {
                    oldO.estimatedWait = newO.estimatedWait;
                    oldO.pizzaRemaining = newO.pizzaRemaining;
                    oldO.pizzaProgress = newO.pizzaProgress;
                    oldO.pizzaAlerted = newO.pizzaAlerted;
                    oldO.grillRemaining = newO.grillRemaining;
                    oldO.grillProgress = newO.grillProgress;
                    oldO.grillAlerted = newO.grillAlerted;
                }
            });

            // Zpracování hlasových upozornění vygenerovaných workerem
            alerts.forEach(alert => {
                const prefix = alert.type === 'pizza' ? 'Pizza' : 'Gril';
                speak(`${prefix}: Objednávka ${alert.item || ''} je hotová!`);
            });
        };

        tickerInterval = setInterval(() => {
            if (!dbOrders.value.length) return;
            kitchenWorker.postMessage({
                orders: JSON.parse(JSON.stringify(dbOrders.value)),
                now: Date.now(),
                capacity: STATION_CAPACITY
            });
        }, 1000);
    };

    onMounted(startKitchenTicker);
    onBeforeUnmount(() => {
        if (tickerInterval) clearInterval(tickerInterval);
        if (kitchenWorker) kitchenWorker.terminate();
    });

    return {
        pendingPizzaOrders, bakingPizzaOrders, completedPizzaOrders, startPizzaBaking, finishPizzaBaking,
        pendingGrillOrders, grillingOrders, completedGrillOrders, startGrilling, finishGrilling
    };
}