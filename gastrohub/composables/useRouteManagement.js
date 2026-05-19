// composables/useRouteManagement.js
import { updateOrder } from '../storage.js';

const { ref, computed } = Vue;

export function useRouteManagement({ dbOrders, loadOrders, modal }) {
    const couriers = ref([
        { id: 1, name: 'Michal (Auto 1)', status: 'Volný' },
        { id: 2, name: 'Jakub (Skútr)', status: 'Volný' }
    ]);
    const routes = ref([]);

    const unassignedOrders = computed(() => 
        dbOrders.value.filter(o => o.status === 'completed_pizza' || o.status === 'completed_grill')
    );

    const createRoute = async (courier) => {
        const ordersToAssign = unassignedOrders.value.map(o => o.id);
        if (ordersToAssign.length === 0) {
            if (modal) modal.alert("Prázdná expedice", "Žádné hotové zakázky k expedici.");
            return;
        }

        const newRoute = {
            id: routes.value.length + 1,
            courierName: courier.name,
            ordersCount: ordersToAssign.length,
            status: 'Na trase',
            assignedOrders: ordersToAssign // Keep track of assigned orders
        };
        routes.value.push(newRoute);

        for (let id of ordersToAssign) {
            const order = dbOrders.value.find(o => o.id === id);
            if (order) {
                await updateOrder({ ...order, status: 'delivering' });
            }
        }
        await loadOrders(); // Refresh global orders
        if (modal) modal.success("Trasa vytvořena", `Trasa pro ${courier.name} byla úspěšně vygenerována.`);
    };

    return { couriers, routes, unassignedOrders, createRoute };
}