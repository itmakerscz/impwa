import { getAllOrders, deleteOrder } from './storage.js';

const { createApp, ref, onMounted, computed } = Vue;

function useOrders() {
    const orders = ref([]);
    const searchQuery = ref("");
    const isLoading = ref(false);
    const error = ref(null);

    const loadOrders = async () => {
        isLoading.value = true;
        error.value = null;
        try {
            const data = await getAllOrders();
            if (Array.isArray(data)) {
                // Sort by date descending
                orders.value = data.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
            }
        } catch (err) {
            console.error("Failed to load orders", err);
            error.value = "Nepodařilo se načíst objednávky.";
        } finally {
            isLoading.value = false;
        }
    };

    const filteredOrders = computed(() => {
        const query = searchQuery.value.toLowerCase().trim();
        if (!query) return orders.value;

        return orders.value.filter(order => 
            (order.item || "").toLowerCase().includes(query) ||
            (order.address || "").toLowerCase().includes(query) ||
            (order.phone || "").toLowerCase().includes(query) ||
            (order.toppings?.some(t => t.toLowerCase().includes(query)))
        );
    });

    const removeOrder = async (id) => {
        await deleteOrder(id);
        await loadOrders();
    };

    return { orders, searchQuery, filteredOrders, removeOrder, loadOrders, isLoading, error };
}

createApp({
    setup() {
        const { orders, searchQuery, filteredOrders, removeOrder, loadOrders, isLoading, error } = useOrders();
        onMounted(loadOrders);
        return { orders, removeOrder, searchQuery, filteredOrders, isLoading, error };
    }
}).mount('#app');