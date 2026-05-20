// orders.js
import { getAllOrders, archiveOrder } from './storage.js';

const { createApp, ref, onMounted, computed } = Vue;

function useOrders() {
    const orders = ref([]);
    const searchQuery = ref("");
    const isLoading = ref(false);
    const error = ref(null);
    const sortKey = ref('created_at'); // Default sort by creation date
    const sortDirection = ref('desc'); // Default descending

    const loadOrders = async () => {
        isLoading.value = true;
        error.value = null;
        try {
            const data = await getAllOrders();
            if (Array.isArray(data)) {
                orders.value = data; // Initial load, sorting applied in computed
            }
        } catch (err) {
            console.error("Chyba při stahování archivu:", err);
            error.value = "Nepodařilo se načíst objednávky.";
        } finally {
            isLoading.value = false;
        }
    };

    const sortedAndFilteredOrders = computed(() => {
        let currentOrders = [...orders.value];

        // 1. Filter
        const query = searchQuery.value.toLowerCase().trim();
        if (query) {
            currentOrders = currentOrders.filter(order =>
                (order.item || "").toLowerCase().includes(query) ||
                (order.address || "").toLowerCase().includes(query) ||
                (order.phone || "").toLowerCase().includes(query)
            );
        }

        // 2. Sort
        if (sortKey.value) {
            currentOrders.sort((a, b) => {
                let valA = a[sortKey.value];
                let valB = b[sortKey.value];

                // Handle dates for sorting
                if (sortKey.value === 'created_at') {
                    valA = new Date(valA).getTime();
                    valB = new Date(valB).getTime();
                } else if (typeof valA === 'string') {
                    valA = valA.toLowerCase();
                    valB = valB.toLowerCase();
                }

                if (valA < valB) return sortDirection.value === 'asc' ? -1 : 1;
                if (valA > valB) return sortDirection.value === 'asc' ? 1 : -1;
                return 0;
            });
        }

        return currentOrders;
    });

    const setSort = (key) => {
        if (sortKey.value === key) {
            sortDirection.value = sortDirection.value === 'asc' ? 'desc' : 'asc';
        } else {
            sortKey.value = key;
            sortDirection.value = 'asc'; // Default to ascending when changing sort key
        }
    };

    const removeOrder = async (id) => {
        if (confirm("Chcete tuto objednávku archivovat?")) {
            await archiveOrder(id);
            await loadOrders();
        }
    };

    return {
        orders, // Keep for direct access if needed, but sortedAndFilteredOrders is preferred for display
        searchQuery,
        filteredOrders: sortedAndFilteredOrders, // Rename to reflect sorting
        removeOrder,
        loadOrders,
        isLoading,
        error,
        sortKey,
        sortDirection,
        setSort
    };
}

createApp({
    setup() {
        const { orders, searchQuery, filteredOrders, removeOrder, loadOrders, isLoading, error, sortKey, sortDirection, setSort } = useOrders();
        onMounted(loadOrders);
        return { orders, removeOrder, searchQuery, filteredOrders, isLoading, error, sortKey, sortDirection, setSort };
    },
    template: `
        <div class="orders-page">
            <h2>Historie objednávek</h2>

            <div class="controls">
                <input type="text" v-model="searchQuery" placeholder="Hledat objednávky..." class="search-input">
                <div class="sort-options">
                    <button @click="setSort('created_at')" :class="{ active: sortKey === 'created_at' }">
                        Datum <span v-if="sortKey === 'created_at'">{{ sortDirection === 'asc' ? '▲' : '▼' }}</span>
                    </button>
                    <button @click="setSort('item')" :class="{ active: sortKey === 'item' }">
                        Položka <span v-if="sortKey === 'item'">{{ sortDirection === 'asc' ? '▲' : '▼' }}</span>
                    </button>
                    <button @click="setSort('address')" :class="{ active: sortKey === 'address' }">
                        Adresa <span v-if="sortKey === 'address'">{{ sortDirection === 'asc' ? '▲' : '▼' }}</span>
                    </button>
                </div>
            </div>

            <div v-if="isLoading" class="loading-indicator">Načítám objednávky...</div>
            <div v-if="error" class="error-message">{{ error }}</div>

            <div v-if="!isLoading && !error && filteredOrders.length === 0" class="no-orders-message">
                Žádné objednávky k zobrazení.
            </div>

            <ul class="order-list">
                <li v-for="order in filteredOrders" :key="order.id" class="order-item-card">
                    <div class="order-header">
                        <span class="order-id">#{{ order.id }}</span>
                        <span class="order-date">{{ new Date(order.created_at).toLocaleString('cs-CZ') }}</span>
                    </div>
                    <p><strong>Položka:</strong> {{ order.item }}</p>
                    <p><strong>Adresa:</strong> {{ order.address }}</p>
                    <p><strong>Telefon:</strong> {{ order.phone }}</p>
                    <p><strong>Stav:</strong> {{ order.status }}</p>
                    <button @click="removeOrder(order.id)" class="archive-button">Archivovat</button>
                </li>
            </ul>
        </div>
    }
}).mount('#app');