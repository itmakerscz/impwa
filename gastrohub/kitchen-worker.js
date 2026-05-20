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
        let allItemsDone = true;

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
                        alerts.push({ name: newItem.name, orderId: order.id });
                        orderChanged = true;
                        shouldSaveToDB = true;
                    }
                }
            }
            
            if (newItem.status !== 'done') allItemsDone = false;
            return newItem;
        });

        if (allItemsDone && order.status !== 'done') {
            order.status = 'done';
            orderChanged = true;
            shouldSaveToDB = true;
        }

        return { ...order, items: updatedItems, _changed: orderChanged };
    });

    self.postMessage({ updatedOrders, alerts, shouldSaveToDB });
};