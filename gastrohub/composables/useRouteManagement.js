// composables/useRouteManagement.js
import { updateOrder } from '../storage.js';

const { ref, computed } = Vue;

export function useRouteManagement({ dbOrders, loadOrders, modal }) {
    const couriers = ref([
        { id: 1, name: 'Michal (Auto 1)', status: 'Volný' },
        { id: 2, name: 'Jakub (Skútr)', status: 'Volný' }
    ]);
    const routes = ref([]);
    const selectedOrderIds = ref([]);

    const unassignedOrders = computed(() => 
        dbOrders.value.filter(o => o.status === 'completed_pizza' || o.status === 'completed_grill')
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

        const newRoute = {
            id: routes.value.length + 1,
            courierName: courier.name,
            ordersCount: ordersToAssign.length,
            totalValue: totalValue,
            status: 'Na trase',
            assignedOrders: orderIds
        };
        routes.value.push(newRoute);

        for (let order of ordersToAssign) {
            await updateOrder({ ...order, status: 'delivering' });
        }

        selectedOrderIds.value = [];
        await loadOrders(); // Refresh global orders
        if (modal) modal.success("Trasa vytvořena", `Trasa pro ${courier.name} byla úspěšně vygenerována. Celková hodnota: ${totalValue} Kč.`);
    };

    return { couriers, routes, unassignedOrders, createRoute, selectedOrderIds, toggleOrderSelection };
}