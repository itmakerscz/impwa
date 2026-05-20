const { ref, computed, watch, onBeforeUnmount } = Vue;
import { updateOrder } from '../storage.js';

export function useKitchenStation({ log, dbOrders, loadOrders, modal }) {
    const timerInterval = ref(null);
    const worker = ref(null);
    
    // Load capacities from localStorage or default to 8
    const pizzaCapacity = ref(parseInt(localStorage.getItem('gastrohub_pizza_capacity')) || 8);
    const grillCapacity = ref(parseInt(localStorage.getItem('gastrohub_grill_capacity')) || 8);
    const isTurboMode = ref(localStorage.getItem('gastrohub_turbo_mode') === 'true');

    const initWorker = () => {
        if (worker.value) return;
        worker.value = new Worker(new URL('../kitchen-worker.js', import.meta.url));
        
        worker.value.onmessage = async (e) => {
            const { updatedOrders, alerts, shouldSaveToDB } = e.data;
            
            // Update local state for immediate UI feedback
            dbOrders.value = updatedOrders;

            // Log alerts for finished items
            alerts.forEach(alert => {
                log(`Položka ${alert.name} z objednávky #${alert.orderId} je hotová!`, 'success');
            });

            // Persist to IndexedDB only if statuses actually changed (optimization)
            if (shouldSaveToDB) {
                for (const order of updatedOrders.filter(o => o._changed)) {
                    delete order._changed; // Clean up temp property
                    await updateOrder(order); 
                }
                await loadOrders();
            }
        };
    };

    // Computed properties to filter orders for each Kanban column
    const filterByItemStatus = (cat, status) => 
        dbOrders.value.filter(order => order.items.some(i => i.category === cat && i.status === status));

    const pendingPizzaOrders = computed(() =>
        filterByItemStatus('pizza', 'pending'));

    const bakingPizzaOrders = computed(() =>
        filterByItemStatus('pizza', 'baking'));

    const completedPizzaOrders = computed(() =>
        dbOrders.value.filter(order =>
            order.items.every(item => item.category === 'pizza' ? item.status === 'done' : true) && // All pizza items done
            order.items.some(item => item.category === 'pizza') // And there is at least one pizza item
        )
    );

    const pendingGrillOrders = computed(() => filterByItemStatus('grill', 'pending'));
    const grillingOrders = computed(() => filterByItemStatus('grill', 'grilling'));

    const completedGrillOrders = computed(() =>
        dbOrders.value.filter(order =>
            order.items.every(item => item.category === 'grill' ? item.status === 'done' : true) && // All grill items done
            order.items.some(item => item.category === 'grill') // And there is at least one grill item
        )
    );

    // Global capacity tracking
    const pizzaActiveCount = computed(() => {
        return bakingPizzaOrders.value.reduce((acc, order) => acc + order.items.filter(i => i.status === 'baking' && i.category === 'pizza').length, 0);
    });

    const grillActiveCount = computed(() => {
        return grillingOrders.value.reduce((acc, order) => acc + order.items.filter(i => i.status === 'grilling' && i.category === 'grill').length, 0);
    });

    const pizzaCapacityReached = computed(() => !isTurboMode.value && pizzaActiveCount.value >= pizzaCapacity.value);
    const grillCapacityReached = computed(() => !isTurboMode.value && grillActiveCount.value >= grillCapacity.value);

    // --- Timer Management ---
    const startGlobalTimer = () => {
        if (timerInterval.value) return;
        initWorker();
        
        timerInterval.value = setInterval(() => {
            worker.value.postMessage({
                orders: JSON.parse(JSON.stringify(dbOrders.value)),
                now: Date.now()
            });
        }, 1000);
    };

    const stopGlobalTimer = () => {
        if (timerInterval.value) {
            clearInterval(timerInterval.value);
            timerInterval.value = null;
        }
    };

    // --- Actions for Kanban Columns ---
    const updateItemStatus = async (order, item, newStatus) => {
        if (!order || !item) return;
        
        const targetOrder = dbOrders.value.find(o => o.id === order.id);
        if (!targetOrder) return;
        
        const targetItem = targetOrder.items.find(i => i.id === item.id);
        if (targetItem) {
            targetItem.status = newStatus;
            
            if (newStatus === 'baking' || newStatus === 'grilling') {
                targetItem.startTime = Date.now();
                targetItem.remainingTime = targetItem.prepTime;
                targetItem.progress = 0;
            } else if (newStatus === 'done') {
                targetItem.remainingTime = 0;
                targetItem.progress = 100;
            }

            await updateOrder(targetOrder); // storage.js handles cloning
            await loadOrders();
            
            if (newStatus === 'baking' || newStatus === 'grilling') {
                startGlobalTimer();
            }
        }
    };

    const startPizzaBaking = (order, item) => updateItemStatus(order, item, 'baking');
    const finishPizzaBaking = (order, item) => updateItemStatus(order, item, 'done');
    const startGrilling = (order, item) => updateItemStatus(order, item, 'grilling');
    const finishGrilling = (order, item) => updateItemStatus(order, item, 'done');

    // Watch orders to start/stop timer automatically whenever active items appear
    watch(() => dbOrders.value, (newOrders) => {
        const hasActiveItems = (newOrders || []).some(order => 
            (order.items || []).some(item => item.status === 'baking' || item.status === 'grilling')
        );
        
        if (hasActiveItems) {
            startGlobalTimer();
        } else if (!hasActiveItems && timerInterval.value) {
            stopGlobalTimer();
        }
    }, { deep: true, immediate: true });

    onBeforeUnmount(() => {
        stopGlobalTimer();
        if (worker.value) {
            worker.value.terminate();
            worker.value = null;
        }
    });

    const toggleTurboMode = () => {
        isTurboMode.value = !isTurboMode.value;
        localStorage.setItem('gastrohub_turbo_mode', isTurboMode.value);
        modal.success("Režim Turbo", `Režim Turbo je nyní ${isTurboMode.value ? 'ZAPNUTÝ' : 'VYPNUTÝ'}.`);
    };

    return {
        pendingPizzaOrders,
        bakingPizzaOrders,
        completedPizzaOrders,
        pendingGrillOrders,
        grillingOrders,
        completedGrillOrders,
        pizzaActiveCount,
        grillActiveCount,
        pizzaCapacity,
        grillCapacity,
        pizzaCapacityReached,
        grillCapacityReached,
        isTurboMode, // Expose turbo mode state
        startPizzaBaking,
        finishPizzaBaking,
        startGrilling,
        finishGrilling,
        toggleTurboMode // Expose toggle function
    };
}