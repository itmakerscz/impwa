// composables/useOrderManager.js
import { parseVoiceTextAsync } from '../parser.js';
import { saveOrder, getAllOrders, saveNickname, getDictionary, deleteNickname } from '../storage.js';
import { formatQty } from '../utils.js';

const { ref, onMounted } = Vue;

export function useOrderManager({ log, modal }, customMenuRef = ref([])) {
    const orders = ref([]);
    const userDictionary = ref([]);
    const isProcessing = ref(false);
    const lastProcessedText = ref('');
    
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
            total += (Number(item.price || 0) + Number(item.extrasPrice || 0)) * (item.quantity || 1);
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

    // Helper function to update currentOrder reactive state consistently
    const updateOrderState = (newItems, address = null, phone = null) => {
        const summary = calculateOrderSummary(newItems);
        currentOrder.value = {
            ...currentOrder.value,
            items: newItems,
            item: summary.item,
            category: summary.category,
            prepTime: summary.prepTime,
            price: summary.price,
            address: address !== null ? address : currentOrder.value.address,
            phone: phone !== null ? phone : currentOrder.value.phone
        };
    };

    // Hlavní metoda, kterou volá useSpeechRecognition při ukončení řeči
    const handleFinalResult = async (text, isNested = false) => {
        const rawText = (text || "").trim();
        const normalizedForDup = rawText.toLowerCase();
        
        if (!isNested) {
            if (isProcessing.value || !normalizedForDup) return;
            if (normalizedForDup === lastProcessedText.value) return;
        }

        isProcessing.value = true;
        lastProcessedText.value = normalizedForDup;

        try {
            const normalized = text.toLowerCase().replace(/[\s.,\/#!$%\^&\*;:{}=\-_`~()]/g, "");

            // Macro Detection
            if (normalized === "novaobjednavka" || normalized === "nováobjednávka") {
                resetOrder();
                return "RESET_TRIGGERED";
            }

            if (normalized.includes("ulozitobjednavku") || normalized.includes("uložitobjednávku")) {
                const cleanText = rawText.replace(/uložit\s+objednávku|ulozit\s+objednavku/gi, "").trim();
                if (cleanText) await handleFinalResult(cleanText, true);
                await handleConfirmOrder();
                return "SAVE_TRIGGERED";
            }

            log(`Zpracovávám: "${rawText}"`, 'log');

            const parsed = await parseVoiceTextAsync(rawText, userDictionary.value, customMenuRef.value);
            if (parsed) {
                const newItems = parsed.items.map(it => ({
                    ...it,
                    extras: it.extras || "",
                    isRush: it.isRush || false
                }));

                updateOrderState([...currentOrder.value.items, ...newItems], parsed.address, parsed.phone);
                log('Data objednávky aktualizována parserem.', 'log');
            }
        } catch (err) {
            log(`Chyba parseru: ${err.message}`, 'error', () => handleFinalResult(rawText, isNested));
        } finally {
            if (!isNested) isProcessing.value = false;
        }
    };

    const addItemToOrder = (item, extras = "", extrasPrice = 0) => {
        const newItem = { ...item, quantity: 1, extrasPrice: extrasPrice, extras: extras, isRush: false }; // Initialize isRush
        updateOrderState([...currentOrder.value.items, newItem]);
    };

    const updateItemExtras = (index, newExtras, newExtrasPrice) => {
        const updatedItems = [...currentOrder.value.items];
        updatedItems[index] = { ...updatedItems[index], extras: newExtras, extrasPrice: newExtrasPrice };
        updateOrderState(updatedItems);
    };

    const removeItemFromOrder = (index) => {
        updateOrderState(currentOrder.value.items.filter((_, i) => i !== index));
    };

    const handleInterimTranscript = (text) => {
        // Zde můžete implementovat průběžné vyhledávání klíčových slov během mluvení
    };

    const handleConfirmOrder = async () => {
        if (currentOrder.value.items.length === 0) {
            if (modal) modal.alert('Prázdná objednávka', 'Objednávka neobsahuje žádné položky k uložení.');
            return;
        }

        const currentDbOrders = await getAllOrders();
        const isDuplicate = currentDbOrders.some(o => {
            return (o.item || "").trim() === (currentOrder.value.item || "").trim() &&
                   (o.address || "").trim() === (currentOrder.value.address || "").trim() &&
                   o.status === 'pending';
        });

        if (isDuplicate) {
            if (modal) modal.alert('Duplicitní objednávka', 'Tato objednávka již v systému čeká na zpracování.');
            return;
        }
        
        if (isProcessing.value) return;

        try {
            isProcessing.value = true;
            const orderId = await saveOrder({
                item: currentOrder.value.item, // Summary string
                items: currentOrder.value.items, // Detailed items array
                address: currentOrder.value.address,
                phone: currentOrder.value.phone,
                status: 'pending',
                category: currentOrder.value.category,
                prepTime: currentOrder.value.prepTime,
                entryTime: Date.now()
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
            await loadOrders();
            resetOrder();
            if (modal) modal.success('Objednávka uložena', `Objednávka #${orderId} byla úspěšně uložena.`);
        } catch (err) {
            log('Chyba při ukládání objednávky: ' + err.message, 'error', handleConfirmOrder);
            if (modal) modal.alert('Chyba uložení', 'Nepodařilo se uložit objednávku do databáze.');
        } finally {
            isProcessing.value = false;
        }
    };

    const resetOrder = () => {
        lastProcessedText.value = '';
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