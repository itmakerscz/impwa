// composables/useKitchenStation.js
import { updateOrder } from '../storage.js';
import { useSpeech } from './useSpeech.js';

const { computed, ref, onMounted, onBeforeUnmount } = Vue;

export function useKitchenStation({ dbOrders, loadOrders }) {
    const { speak } = useSpeech();
    let tickerInterval = null;

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

    // Global Ticker for countdowns
    const startKitchenTicker = () => {
        tickerInterval = setInterval(() => {
            dbOrders.value.forEach(order => {
                // Pizza countdown
                if (order.status === 'baking' && order.pizzaStartedAt && order.pizzaTotal) {
                    const elapsed = Math.floor((Date.now() - order.pizzaStartedAt) / 1000);
                    const remaining = Math.max(0, order.pizzaTotal - elapsed);
                    
                    if (order.pizzaRemaining !== remaining) {
                        order.pizzaRemaining = remaining;
                        order.pizzaProgress = Math.round(((order.pizzaTotal - remaining) / order.pizzaTotal) * 100);
                    }

                    if (remaining === 0 && !order.pizzaAlerted) {
                        speak(`Pizza: Objednávka ${order.item} je hotová!`);
                        order.pizzaAlerted = true; // Prevent repeated alerts
                    }
                }
                // Grill countdown
                if (order.status === 'grilling' && order.grillStartedAt && order.grillTotal) {
                    const elapsed = Math.floor((Date.now() - order.grillStartedAt) / 1000);
                    const remaining = Math.max(0, order.grillTotal - elapsed);
                    // Update reactive property for UI, but don't persist every second
                    order.grillRemaining = remaining;
                    order.grillProgress = Math.round(((order.grillTotal - remaining) / order.grillTotal) * 100);
                    if (remaining === 0 && !order.grillAlerted) {
                        speak(`Gril: Objednávka ${order.item} je hotová!`);
                        order.grillAlerted = true; // Prevent repeated alerts
                    }
                }
            });
        }, 1000);
    };

    onMounted(startKitchenTicker);
    onBeforeUnmount(() => {
        if (tickerInterval) clearInterval(tickerInterval);
    });

    return {
        pendingPizzaOrders, bakingPizzaOrders, completedPizzaOrders, startPizzaBaking, finishPizzaBaking,
        pendingGrillOrders, grillingOrders, completedGrillOrders, startGrilling, finishGrilling
    };
}