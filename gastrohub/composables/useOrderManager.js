// composables/useOrderManager.js
import { parseVoiceTextAsync } from '../parser.js';
import { saveOrder, getAllOrders, saveNickname, getDictionary, deleteNickname } from '../storage.js';
import { formatQty } from '../utils.js';

const { ref, onMounted } = Vue;

export function useOrderManager({ log, modal }, customMenuRef = ref([])) {
    const orders = ref([]);
    const userDictionary = ref([]);
    const isProcessing = ref(false);
    let lastProcessedText = '';
    
    // Aktuálně rozpracovaná objednávka zachycená z hlasu
    const currentOrder = ref({
        item: '', // Summary string, e.g., "1x Pizza, 2x Kure"
        items: [], // Detailed array of item objects
        address: '',
        phone: '',
        status: 'pending',
        category: 'pizza',
        prepTime: 0,
        price: 0
    });

    const loadDictionary = async () => {
        try {
            const dict = await getDictionary();
            userDictionary.value = dict || [];
        } catch (err) {
            log('Chyba při načítání slovníku: ' + err.message, 'error', loadDictionary);
        }
    };

    const loadOrders = async () => {
        try {
            const data = await getAllOrders();
            if (Array.isArray(data)) {
                orders.value = data;
            }
        } catch (err) {
            log('Chyba při načítání objednávek: ' + err.message, 'error', loadOrders);
        }
    };

    // Helper function to calculate total price, prep time, and summary string from items array
    const calculateOrderSummary = (itemsArray) => {
        let total = 0;
        let maxPrep = 0;
        const consolidated = {};
        let categories = new Set();

        itemsArray.forEach(item => {
            total += ((item.price || 0) + (item.extrasPrice || 0)) * (item.quantity || 1);
            maxPrep = Math.max(maxPrep, item.prepTime || 0);
            consolidated[item.name] = (consolidated[item.name] || 0) + (item.quantity || 1);
            if (item.category) categories.add(item.category);
        });

        // Priority for order classification: Grill > Pizza > Drinks
        const primaryCategory = categories.has('grill') ? 'grill' : (categories.has('pizza') ? 'pizza' : 'drinks');

        const itemSummary = Object.entries(consolidated)
            .map(([name, qty]) => `${formatQty(qty)}x ${name}`)
            .join(", ");

        return {
            item: itemSummary,
            price: total,
            prepTime: maxPrep,
            category: primaryCategory
        };
    };

    // Hlavní metoda, kterou volá useSpeechRecognition při ukončení řeči
    const handleFinalResult = async (text, isNested = false) => {
        const normalizedForDup = (text || "").trim().toLowerCase();
        
        // Prevence duplicitních výsledků (ghosting na Androidu)
        if (!isNested) {
            if (isProcessing.value || !normalizedForDup) return;
            if (normalizedForDup === lastProcessedText) return;
        }

        isProcessing.value = true;
        lastProcessedText = normalizedForDup;

        try {
            const normalized = text.toLowerCase().replace(/[\s.,\/#!$%\^&\*;:{}=\-_`~()]/g, "");

            if (normalized.includes("novaobjednavka") || normalized.includes("nováobjednávka")) {
                resetOrder();
                return "RESET_TRIGGERED";
            }

            if (normalized.includes("ulozitobjednavku") || normalized.includes("uložitobjednávku")) {
                const cleanText = text.replace(/uložit\s+objednávku|ulozit\s+objednavku/gi, "").trim();
                if (cleanText) await handleFinalResult(cleanText, true);
                await handleConfirmOrder();
                return "SAVE_TRIGGERED";
            }

            log(`Zpracovávám: "${text}"`, 'log');

            const parsed = await parseVoiceTextAsync(text, userDictionary.value, customMenuRef.value);
            if (parsed) {
                const itemsWithExtras = parsed.items.map(it => ({
                    ...it,
                    extras: it.extras || "",
                    isRush: it.isRush || false
                }));

                const combinedItemsArray = [...currentOrder.value.items, ...itemsWithExtras];
                const summary = calculateOrderSummary(combinedItemsArray);

                currentOrder.value = {
                    ...currentOrder.value,
                    items: combinedItemsArray,
                    item: summary.item,
                    address: parsed.address || currentOrder.value.address,
                    phone: parsed.phone || currentOrder.value.phone,
                    category: summary.category,
                    prepTime: summary.prepTime,
                    price: summary.price
                };
                log(`Parser úspěšně naplnil data objednávky.`, 'log');
            }
        } catch (err) {
            log(`Chyba parseru: ${err.message}`, 'error', () => handleFinalResult(text, isNested));
        } finally {
            if (!isNested) isProcessing.value = false;
        }
    };

    const addItemToOrder = (item, extras = "", extrasPrice = 0) => {
        // Add the new item (with quantity 1) to the detailed items array
        const newItem = { ...item, quantity: 1, extrasPrice: extrasPrice, extras: extras, isRush: false }; // Initialize isRush
        const combinedItemsArray = [...currentOrder.value.items, newItem];
        const summary = calculateOrderSummary(combinedItemsArray);

        currentOrder.value.items = combinedItemsArray;
        currentOrder.value.item = summary.item;
        currentOrder.value.category = summary.category;
        currentOrder.value.prepTime = summary.prepTime;
        currentOrder.value.price = summary.price;
    };

    const updateItemExtras = (index, newExtras, newExtrasPrice) => {
        if (index >= 0 && index < currentOrder.value.items.length) {
            const itemToUpdate = currentOrder.value.items[index];
            itemToUpdate.extras = newExtras;
            itemToUpdate.extrasPrice = newExtrasPrice;

            // Recalculate summary for the entire order
            const summary = calculateOrderSummary(currentOrder.value.items);
            currentOrder.value.item = summary.item;
            currentOrder.value.category = summary.category;
            currentOrder.value.prepTime = summary.prepTime;
            currentOrder.value.price = summary.price;
        }
    };

    const removeItemFromOrder = (index) => {
        if (index >= 0 && index < currentOrder.value.items.length) {
            currentOrder.value.items.splice(index, 1);
            // Recalculate summary for the remaining items
            const summary = calculateOrderSummary(currentOrder.value.items);
            currentOrder.value.item = summary.item;
            currentOrder.value.category = summary.category;
            currentOrder.value.prepTime = summary.prepTime;
            currentOrder.value.price = summary.price;
        }
    };

    const handleInterimTranscript = (text) => {
        // Zde můžete implementovat průběžné vyhledávání klíčových slov během mluvení
    };

    const handleConfirmOrder = async () => {
        if (currentOrder.value.items.length === 0) { // Check detailed items array
            if (modal) modal.alert('Prázdná objednávka', 'Objednávka neobsahuje žádné položky k uložení.');
            return;
        }

        // Prevence duplicitních objednávek
        // Re-fetch or use the reactive reference to ensure we check against the latest DB state
        const currentDbOrders = await getAllOrders();
        const isDuplicate = currentDbOrders.some(o => {
            const sameItem = (o.item || "").trim() === (currentOrder.value.item || "").trim();
            const sameAddress = (o.address || "").trim() === (currentOrder.value.address || "").trim();
            return sameItem && sameAddress && o.status === 'pending';
        });

        if (isDuplicate) {
            if (modal) modal.alert('Duplicitní objednávka', 'Tato objednávka již v systému čeká na zpracování.');
            return;
        }

        // Prevent multiple simultaneous save operations
        const saveInProgress = isProcessing.value && currentOrder.value.items.length > 0;
        // If called from UI button while handleFinalResult is still running, we wait/block
        if (!saveInProgress && isProcessing.value) return;

        try {
            const orderId = await saveOrder({
                item: currentOrder.value.item, // Summary string
                items: currentOrder.value.items, // Detailed items array
                address: currentOrder.value.address,
                phone: currentOrder.value.phone,
                status: 'pending',
                category: currentOrder.value.category,
                prepTime: currentOrder.value.prepTime,
                entryTime: Date.now() // Record when the order enters the queue
            });

            // Update item frequency stats for the "Frequent" menu section
            const usage = JSON.parse(localStorage.getItem('gastrohub_item_stats') || '{}');
            currentOrder.value.items.forEach(item => {
                if (item.name && item.name !== "Nerozpoznaná položka") {
                    usage[item.name] = (usage[item.name] || 0) + 1;
                }
            });
            localStorage.setItem('gastrohub_item_stats', JSON.stringify(usage));

            log(`Objednávka #${orderId} byla úspěšně uložena do IndexedDB.`, 'log');
            resetOrder();
            await loadOrders(); // Osvěžení stavu pro kuchyň a pec
            if (modal) modal.success('Objednávka uložena', `Objednávka #${orderId} byla úspěšně uložena.`);
        } catch (err) {
            log('Chyba při ukládání objednávky: ' + err.message, 'error', handleConfirmOrder);
            if (modal) modal.alert('Chyba uložení', 'Nepodařilo se uložit objednávku do databáze.');
        }
    };


    const resetOrder = () => {
        lastProcessedText = '';
        currentOrder.value = {
            item: '',
            items: [],
            address: '',
            phone: '',
            status: 'pending',
            category: 'pizza', // Default category
            prepTime: 0,
            price: 0
        };
    };

    // Správa uživatelských přezdívek (Slovník)
    const addNickname = async (nickname, pizzaName) => {
        if (!nickname || !pizzaName) return;
        await saveNickname(nickname, pizzaName);
        await loadDictionary();
    };

    const removeNickname = async (nickname) => {
        await deleteNickname(nickname);
        await loadDictionary();
    };

    onMounted(() => {
        loadOrders();
        loadDictionary();
    });

    return {
        orders,
        currentOrder,
        userDictionary,
        isProcessing,
        handleFinalResult,
        handleInterimTranscript,
        handleConfirmOrder,
        resetOrder,
        addItemToOrder,
        updateItemExtras, // Expose new method
        removeItemFromOrder, // Expose new method
        addNickname,
        removeNickname,
        getAllOrders // Zpřístupnění pro synchronizaci v hlavním app.js
    };
}