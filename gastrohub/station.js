// station.js
import { getAllOrders, updateOrder, archiveOrder as dbArchiveOrder } from './storage.js';
import { useSpeech } from './composables/useSpeech.js'; // New import
 
const { createApp, ref, onMounted, onBeforeUnmount, computed } = Vue;

createApp({
    setup() {
        const orders = ref([]);
        const isLoading = ref(false);
        const error = ref(null);
        let tickerInterval = null;
        const { speak } = useSpeech(); // Initialize speech composable

        // Načtení všech aktivních zakázek z databáze
        const loadOrders = async () => {
            isLoading.value = true;
            try {
                const data = await getAllOrders();
                orders.value = data || [];
            } catch (err) {
                console.error("Chyba při načítání stanice:", err);
                error.value = "Nepodařilo se načíst data pro kuchyň.";
            } finally {
                isLoading.value = false;
            }
        };

        // Rozřazení objednávek do sloupců podle stavu
        const pendingOrders = computed(() => orders.value.filter(o => o.status === 'pending' || !o.status));
        const bakingOrders = computed(() => orders.value.filter(o => o.status === 'baking'));
        const completedOrders = computed(() => orders.value.filter(o => o.status === 'completed'));

        // Přesun do pece (Zahájení pečení s časovačem na 300 sekund)
        const startBaking = async (order) => {
            order.status = 'baking';
            order.bakingTotal = 300; // 5 minut výchozí čas pečení
            order.bakingRemaining = 300;
            order.startedBakingAt = Date.now(); // Persist this timestamp
            
            await updateOrder(order);
            await loadOrders();
        };

        // Časovač pro aktualizaci stavu v reálném čase (pouze pro UI, nepersistuje každou sekundu)
        const startTicker = () => {
            tickerInterval = setInterval(() => {
                orders.value.forEach(order => {
                    if (order.status === 'baking' && order.startedBakingAt && order.bakingTotal) {
                        const elapsed = Math.floor((Date.now() - order.startedBakingAt) / 1000);
                        const remaining = Math.max(0, order.bakingTotal - elapsed);
                        order.bakingRemaining = remaining; // Update reactive property for UI
                        if (remaining === 0 && !order.bakingAlerted) { // Prevent repeated alerts
                            const isGrill = order.item?.toLowerCase().includes('gril');
                            const prefix = isGrill ? 'Gril' : 'Pizza';
                            const action = isGrill ? 'je hotový' : 'je upečena';
                            speak(`Pozor! ${prefix}: ${order.item || 'Objednávka'} ${action}!`);
                            order.bakingAlerted = true;
                            updateOrder(JSON.parse(JSON.stringify(order))); // Persist alerted state to DB
                        }
                    }
                });
            }, 1000);
        };

        // Dokončení pečení a přesun do výdeje / k řidiči
        const completeOrder = async (order) => {
            const updatedOrder = {
                ...order,
                status: 'completed'
            };
            await updateOrder(updatedOrder);
            await loadOrders();
        };

        // Odstranění / archivace staré objednávky z displeje
        const archiveOrder = async (id) => {
            if (confirm("Opravdu chcete objednávku trvale odstranit z displeje?")) {
                await dbArchiveOrder(id); // This will move it to archive store
                await loadOrders();
            }
        };

        // Pomocné funkce pro formátování času
        const formatTime = (seconds) => {
            if (seconds <= 0) return "HOTOVO 🔥";
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        };

        const getProgress = (order) => {
            if (!order.bakingTotal) return 0;
            return ((order.bakingTotal - order.bakingRemaining) / order.bakingTotal) * 100;
        };

        onMounted(() => {
            loadOrders();
            startTicker();
        });

        onBeforeUnmount(() => {
            if (tickerInterval) clearInterval(tickerInterval);
        });

        return {
            isLoading,
            error,
            pendingOrders,
            bakingOrders,
            completedOrders,
            startBaking,
            completeOrder,
            archiveOrder,
            formatTime,
            getProgress,
            loadOrders
        };
    }
}).mount('#station-app');