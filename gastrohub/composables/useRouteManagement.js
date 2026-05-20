// composables/useRouteManagement.js
import { updateOrder, archiveOrder } from '../storage.js';

const { ref, computed } = Vue;

export function useRouteManagement({ dbOrders, loadOrders, modal }) {
    const couriers = ref([
        { id: 1, name: 'Michal (Auto 1)', status: 'Volný' },
        { id: 2, name: 'Jakub (Skútr)', status: 'Volný' }
    ]);
    const routes = ref([]);
    const selectedOrderIds = ref([]);

    const unassignedOrders = computed(() => 
        (dbOrders.value || []).filter(o => o.status === 'done' || (o.items && o.items.every(i => i.status === 'done')))
    );

    const toggleOrderSelection = (id) => {
        const index = selectedOrderIds.value.indexOf(id);
        if (index > -1) {
            selectedOrderIds.value.splice(index, 1);
        } else {
            selectedOrderIds.value.push(id);
        }
    };

    const createRoute = async (courier) => {
        const ordersToAssign = unassignedOrders.value.filter(o => selectedOrderIds.value.includes(o.id));
        if (ordersToAssign.length === 0) {
            if (modal) modal.alert("Žádný výběr", "Prosím vyberte alespoň jednu objednávku k expedici.");
            return;
        }

        const totalValue = ordersToAssign.reduce((sum, order) => sum + (order.price || 0), 0);
        const orderIds = ordersToAssign.map(o => o.id);

        routes.value.push({
            id: Date.now(), 
            courierName: courier.name,
            ordersCount: ordersToAssign.length,
            totalValue: totalValue,
            status: 'Na trase',
            assignedOrders: orderIds,
            orders: [...ordersToAssign]
        });

        // Concurrent status updates
        await Promise.all(ordersToAssign.map(order => 
            updateOrder({ ...order, status: 'delivering' })
        ));

        selectedOrderIds.value = [];
        await loadOrders(); // Refresh global orders
        if (modal) modal.success("Trasa vytvořena", `Trasa pro ${courier.name} byla úspěšně vygenerována. Celková hodnota: ${totalValue} Kč.`);
    };

    const completeRoute = async (routeId) => {
        const routeIndex = routes.value.findIndex(r => r.id === routeId);
        if (routeIndex === -1) return;
        const route = routes.value[routeIndex];

        try {
            // Archive all orders associated with this route
            for (const orderId of route.assignedOrders) {
                await archiveOrder(orderId);
            }
            // Remove the route from active routes
            routes.value.splice(routeIndex, 1);
            await loadOrders();
            if (modal) modal.success("Doručeno", `Trasa #${routeId} byla úspěšně uzavřena a objednávky archivovány.`);
        } catch (err) {
            if (modal) modal.alert("Chyba", "Nepodařilo se dokončit trasu: " + err.message);
        }
    };

    return { couriers, routes, unassignedOrders, createRoute, completeRoute, selectedOrderIds, toggleOrderSelection };
}