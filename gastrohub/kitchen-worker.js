// kitchen-worker.js
/**
 * Web Worker pro výpočty v kuchyni.
 * Izoluje náročné iterace a výpočty od hlavního UI vlákna.
 */
self.onmessage = function(e) {
    const { orders, now, capacity } = e.data;
    if (!orders) return;

    const alerts = [];
    
    // Pomocná logika pro výpočet volného slotu (přesunuto z useKitchenStation.js)
    const getWaitTime = (activeOrders) => {
        if (!activeOrders || activeOrders.length < capacity) return 0;
        const times = activeOrders.map(o => (o.pizzaRemaining || o.grillRemaining || 0)).sort((a, b) => a - b);
        return times[0] || 0;
    };

    const bakingPizza = orders.filter(o => o.status === 'baking');
    const grilling = orders.filter(o => o.status === 'grilling');

    const updatedOrders = orders.map(order => {
        const o = { ...order };

        // 1. Čekací doby ve frontě
        if (!o.status || o.status === 'pending') {
            const active = o.category === 'pizza' ? bakingPizza : grilling;
            o.estimatedWait = getWaitTime(active);
        }

        // 2. Countdown Pizza
        if (o.status === 'baking' && o.pizzaStartedAt && o.pizzaTotal) {
            const elapsed = Math.floor((now - o.pizzaStartedAt) / 1000);
            const remaining = Math.max(0, o.pizzaTotal - elapsed);
            o.pizzaRemaining = remaining;
            o.pizzaProgress = Math.round(((o.pizzaTotal - remaining) / o.pizzaTotal) * 100);

            if (remaining === 0 && !o.pizzaAlerted) {
                alerts.push({ type: 'pizza', item: o.item, id: o.id });
                o.pizzaAlerted = true;
            }
        }

        // 3. Countdown Grill
        if (o.status === 'grilling' && o.grillStartedAt && o.grillTotal) {
            const elapsed = Math.floor((now - o.grillStartedAt) / 1000);
            const remaining = Math.max(0, o.grillTotal - elapsed);
            o.grillRemaining = remaining;
            o.grillProgress = Math.round(((o.grillTotal - remaining) / o.grillTotal) * 100);

            if (remaining === 0 && !o.grillAlerted) {
                alerts.push({ type: 'grill', item: o.item, id: o.id });
                o.grillAlerted = true;
            }
        }
        return o;
    });

    self.postMessage({ updatedOrders, alerts });
};