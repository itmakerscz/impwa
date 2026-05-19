// composables/useOrderManager.js
import { parseVoiceTextAsync } from '../parser.js';
import { saveOrder, getAllOrders, saveNickname, getDictionary, deleteNickname } from '../storage.js';

const { ref, onMounted } = Vue;

export function useOrderManager({ log, modal }, customMenuRef = ref([])) {
    const orders = ref([]);
    const userDictionary = ref([]);
    
    // Aktuálně rozpracovaná objednávka zachycená z hlasu
    const currentOrder = ref({
        item: '',
        address: '',
        phone: '',
        status: 'pending',
        category: 'pizza',
        prepTime: 300
    });

    const loadDictionary = async () => {
        try {
            const dict = await getDictionary();
            userDictionary.value = dict || [];
        } catch (err) {
            log('Chyba při načítání slovníku: ' + err.message, 'error');
        }
    };

    const loadOrders = async () => {
        try {
            const data = await getAllOrders();
            orders.value = data || [];
        } catch (err) {
            log('Chyba při načítání objednávek: ' + err.message, 'error');
        }
    };

    // Pomocná funkce pro sjednocení položek (např. "1x Pizza, 1x Pizza" -> "2x Pizza")
    const consolidateItems = (itemString) => {
        const itemMap = {};
        // Rozdělíme řetězec podle čárek a zpracujeme každou část
        itemString.split(/[,+]/).forEach(part => {
            const trimmed = part.trim();
            if (!trimmed) return;

            // Hledáme formát "2x Název" nebo jen "Název" (předpokládáme 1x)
            const match = trimmed.match(/^(\d+)x\s+(.+)$/);
            if (match) {
                const qty = parseInt(match[1]);
                const name = match[2];
                itemMap[name] = (itemMap[name] || 0) + qty;
            } else if (trimmed && trimmed !== "Nerozpoznaná položka") {
                itemMap[trimmed] = (itemMap[trimmed] || 0) + 1;
            }
        });
        return Object.entries(itemMap)
            .map(([name, qty]) => `${qty}x ${name}`)
            .join(", ");
    };

    // Hlavní metoda, kterou volá useSpeechRecognition při ukončení řeči
    const handleFinalResult = async (text) => {
        const normalized = text.toLowerCase().replace(/[\s.,\/#!$%\^&\*;:{}=\-_`~()]/g, "");

        // Voice Macro: Nová objednávka
        if (normalized.includes("novaobjednavka")) {
            log("Příkaz: Nová objednávka zachycen.", "info");
            resetOrder();
            return "RESET_TRIGGERED"; // Signal to recognition to clear its buffer
        }

        // Voice Macro: Uložit objednávku
        if (normalized.includes("ulozitobjednavku")) {
            log("Příkaz: Uložit objednávku zachycen.", "info");
            const cleanText = text.replace(/uložit\s+objednávku/gi, "").trim();
            await handleFinalResult(cleanText); // Parse the actual text first
            await handleConfirmOrder();
            return "SAVE_TRIGGERED";
        }

        log(`Zpracovávám hlas (Worker + Menu): "${text}"`, 'log');

        try {
            const parsed = await parseVoiceTextAsync(text, userDictionary.value, customMenuRef.value);
            if (parsed) {
                // Pokud už v objednávce něco je, spojíme to a zkonsolidujeme
                const combinedItems = currentOrder.value.item 
                    ? `${currentOrder.value.item}, ${parsed.item}`
                    : parsed.item;

                currentOrder.value = {
                    ...currentOrder.value,
                    item: consolidateItems(combinedItems),
                    address: parsed.address || currentOrder.value.address,
                    phone: parsed.phone || currentOrder.value.phone,
                    category: parsed.category || currentOrder.value.category,
                    prepTime: parsed.prepTime || currentOrder.value.prepTime
                };
                log(`Parser úspěšně naplnil data objednávky.`, 'log');
            }
        } catch (err) {
            log(`Chyba parseru: ${err.message}`, 'error');
        }
    };

    const addItemToOrder = (item) => {
        currentOrder.value.item = currentOrder.value.item || "";
        const combined = currentOrder.value.item 
            ? `${currentOrder.value.item}, 1x ${item.name}` 
            : `1x ${item.name}`;
        
        currentOrder.value.item = consolidateItems(combined);
        currentOrder.value.category = item.category || 'pizza';
    };

    const handleInterimTranscript = (text) => {
        // Zde můžete implementovat průběžné vyhledávání klíčových slov během mluvení
    };

    const handleConfirmOrder = async () => {
        if (!currentOrder.value.item) {
            if (modal) modal.alert('Prázdná objednávka', 'Objednávka neobsahuje žádné položky k uložení.');
            return;
        }

        // Prevence duplicitních objednávek
        // Re-fetch or use the reactive reference to ensure we check against the latest DB state
        const currentDbOrders = await getAllOrders();
        const isDuplicate = currentDbOrders.some(o => 
            o.item === currentOrder.value.item && 
            o.address === currentOrder.value.address && 
            o.status === 'pending'
        );

        if (isDuplicate) {
            if (modal) modal.alert('Duplicitní objednávka', 'Tato objednávka již v systému čeká na zpracování.');
            return;
        }

        try {
            const orderId = await saveOrder({
                item: currentOrder.value.item,
                address: currentOrder.value.address,
                phone: currentOrder.value.phone,
                status: 'pending',
                category: currentOrder.value.category,
                prepTime: currentOrder.value.prepTime
            });

            // Update item frequency stats for the "Frequent" menu section
            const usage = JSON.parse(localStorage.getItem('gastrohub_item_stats') || '{}');
            currentOrder.value.item.split(',').forEach(part => {
                // Remove quantity prefix (e.g., "1x ") and trim whitespace
                const name = part.trim().replace(/^\d+x\s+/, '');
                if (name && name !== "Nerozpoznaná položka") {
                    usage[name] = (usage[name] || 0) + 1;
                }
            });
            localStorage.setItem('gastrohub_item_stats', JSON.stringify(usage));

            log(`Objednávka #${orderId} byla úspěšně uložena do IndexedDB.`, 'log');
            resetOrder();
            await loadOrders(); // Osvěžení stavu pro kuchyň a pec
        } catch (err) {
            log('Chyba při ukládání objednávky: ' + err.message, 'error');
            if (modal) modal.alert('Chyba uložení', 'Nepodařilo se uložit objednávku do databáze.');
        }
    };

    const resetOrder = () => {
        currentOrder.value = {
            item: '',
            address: '',
            phone: '',
            status: 'pending',
            category: 'pizza',
            prepTime: 300
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
        handleFinalResult,
        handleInterimTranscript,
        handleConfirmOrder,
        resetOrder,
        addItemToOrder,
        addNickname,
        removeNickname,
        getAllOrders // Zpřístupnění pro synchronizaci v hlavním app.js
    };
}