// kitchen-worker.js
/**
 * Web Worker pro výpočty v kuchyni.
 * Izoluje náročné iterace a výpočty od hlavního UI vlákna.
 */
self.onmessage = function(e) {
    const { orders, now } = e.data;
    if (!orders) return;

    const alerts = [];
    let shouldSaveToDB = false;

    const updatedOrders = orders.map(order => {
        if (!order || !Array.isArray(order.items)) return { ...order, _changed: false };

        let orderChanged = false;
        let maxItemRemaining = 0;
        let itemsInProgress = 0;

        const updatedItems = order.items.map(item => {
            const newItem = { ...item };

            if (newItem.status === 'baking' || newItem.status === 'grilling') {
                if (newItem.startTime && newItem.prepTime > 0) {
                    const elapsed = Math.floor((now - newItem.startTime) / 1000);
                    const remaining = Math.max(0, newItem.prepTime - elapsed);
                    newItem.remainingTime = remaining;
                    newItem.progress = Math.min(100, (elapsed / newItem.prepTime) * 100);

                    if (remaining === 0 && newItem.status !== 'done') {
                        newItem.status = 'done';
                        newItem.progress = 100;
                        // Send descriptive individual item alert
                        alerts.push({ 
                            name: newItem.name, 
                            orderId: order.id,
                            itemId: newItem.id,
                            category: newItem.category
                        });
                        orderChanged = true;
                        shouldSaveToDB = true;
                    } else if (remaining > 0) {
                        itemsInProgress++;
                        if (remaining > maxItemRemaining) maxItemRemaining = remaining;
                    }
                }
            }
            return newItem;
        });

        // The order's overall remaining time is now the maximum of its constituent items
        const newRemaining = itemsInProgress > 0 ? maxItemRemaining : 0;
        if (newRemaining !== order.bakingRemaining) {
            orderChanged = true;
        }

        return { 
            ...order, 
            items: updatedItems, 
            bakingRemaining: newRemaining, 
            _changed: orderChanged 
        };
    });

    self.postMessage({ updatedOrders, alerts, shouldSaveToDB });
};