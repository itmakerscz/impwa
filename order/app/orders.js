import { getAllOrders, deleteOrder } from './storage.js';

const { createApp, ref, onMounted, computed } = Vue;

createApp({
    setup() {
        const orders = ref([]);
        const searchQuery = ref("");

        const loadOrders = async () => {
            try {
                orders.value = await getAllOrders();
                // Sort by date descending
                orders.value.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            } catch (err) {
                console.error("Failed to load orders", err);
            }
        };

        const filteredOrders = computed(() => {
            const query = searchQuery.value.toLowerCase().trim();
            if (!query) return orders.value;

            return orders.value.filter(order => 
                (order.item && order.item.toLowerCase().includes(query)) ||
                (order.address && order.address.toLowerCase().includes(query))
            );
        });

        const removeOrder = async (id) => {
            await deleteOrder(id);
            await loadOrders();
        };

        onMounted(loadOrders);

        return { orders, removeOrder, searchQuery, filteredOrders };
    }
}).mount('#app');