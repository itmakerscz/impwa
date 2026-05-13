import { extractOrderData, normalizeDictionary } from '../parser.js';
import { saveOrder, saveNickname, getDictionary, deleteNickname } from '../storage.js';
import { useNotification } from './useNotification.js';

const { ref, computed, onMounted } = Vue;
const SPEECH_KEYWORDS = ["přidej", "chci navíc", "dej mi tam", "extra", "přidat", "přidejte"];
const NICKNAME_KEYWORD = "ulož přezdívku";
const READ_ORDER_KEYWORDS = ["přečti", "zopakuj", "rekapitulace", "shrnuti", "kontrola"];

export function useOrderManager(transcript, speechSynthesizer, stopListening) {
    const currentOrder = ref(null);
    const isSummaryCollapsed = ref(false);
    const userDictionary = ref([]);
    const lastDeletedNickname = ref(null);

    const successToast = useNotification();
    const undoToast = useNotification();

    const refreshDictionary = async () => {
        const data = await getDictionary();
        userDictionary.value = normalizeDictionary(data);
    };

    onMounted(refreshDictionary);

    const processFinalResult = (text) => {
        let isCommand = false;

        // Handle Nickname Saving: "Ulož přezdívku [X] pro [Pizza Name]"
        if (text.includes(NICKNAME_KEYWORD)) {
            const parts = text.split(NICKNAME_KEYWORD).pop().split(" pro ");
            if (parts.length === 2) {
                const nickname = parts[0].trim();
                const pizzaName = parts[1].trim();
                saveNickname(nickname, pizzaName).then(async () => {
                    await refreshDictionary();
                    speechSynthesizer.speak(`Uloženo. Odteď ${nickname} znamená ${pizzaName}`);
                });
                return;
            }
        }

        // Handle Order Read Back: "Přečti objednávku" or "Zopakuj co tam je"
        if (READ_ORDER_KEYWORDS.some(key => text.includes(key))) {
            if (currentOrder.value && currentOrder.value.items.length > 0) {
                const itemsDesc = currentOrder.value.items.map(i => `${i.quantity}x ${i.name}`).join(", ");
                const toppingsDesc = currentOrder.value.toppings.length > 0 
                    ? `. S extra přísadami: ${currentOrder.value.toppings.join(", ")}` 
                    : "";
                speechSynthesizer.speak(`Vaše objednávka obsahuje: ${itemsDesc}${toppingsDesc}.`);
            } else {
                speechSynthesizer.speak("Zatím jste nic neobjednali.");
            }
            return;
        }

        for (const key of SPEECH_KEYWORDS) {
            if (text.includes(key)) {
                const topping = text.split(key).pop().trim();
                if (topping && currentOrder.value) {
                    currentOrder.value.toppings.push(topping);
                    speechSynthesizer.speak(`Přidávám ${topping}`);
                    isCommand = true;
                    break;
                }
            }
        }

        // Only finalize the order state if we actually detected items.
        // This prevents an "empty" order result from blocking subsequent transcript updates.
        if (!isCommand) {
            const extracted = extractOrderData(text, userDictionary.value);
            if (extracted && extracted.items.length > 0) {
                currentOrder.value = extracted;
                console.log("Successfully parsed order:", currentOrder.value);
            }
        }
    };

    const triggerSuccess = () => {
        successToast.trigger(3000);
        isSummaryCollapsed.value = true;
    };

    const handleConfirmOrder = async () => {
        if (!currentOrder.value) return;
        try {
            // Convert reactive Proxy to a plain object to prevent DataCloneError in IndexedDB
            const plainOrder = JSON.parse(JSON.stringify(currentOrder.value));
            plainOrder.rawText = transcript.value;
            await saveOrder(plainOrder);

            speechSynthesizer.speak("Objednávka byla uložena.");
            triggerSuccess();
            resetOrder(false); // Reset order data but don't stop listening if not needed
        } catch (err) {
            console.error("Storage error:", err);
            alert("Nepodařilo se uložit objednávku.");
        }
    };

    const resetOrder = (shouldStopListening = true) => {
        currentOrder.value = null;
        transcript.value = "";
        isSummaryCollapsed.value = false;
        if (shouldStopListening) stopListening();
    };

    const addNickname = async (nickname, pizzaName) => {
        if (!nickname || !pizzaName) return;
        await saveNickname(nickname, pizzaName);
        await refreshDictionary();
        speechSynthesizer.speak(`Uloženo. Odteď ${nickname} znamená ${pizzaName}`);
    };

    const removeNickname = async (nickname) => {
        if (!nickname) return;
        
        // Store for Undo before deleting
        const entry = userDictionary.value.find(d => d.nickname === nickname.toLowerCase());
        if (entry) {
            lastDeletedNickname.value = { nickname: entry.nickname, pizzaName: entry.pizzaName };
        }

        await deleteNickname(nickname);
        await refreshDictionary();
        
        undoToast.trigger(5000); // Show undo option for 5 seconds
        speechSynthesizer.speak(`Přezdívka ${nickname} byla smazána.`);
    };

    const undoRemoveNickname = async () => {
        if (lastDeletedNickname.value) {
            const { nickname, pizzaName } = lastDeletedNickname.value;
            await addNickname(nickname, pizzaName);
            lastDeletedNickname.value = null;
        }
    };

    // Computed property for toppings textarea to handle string <-> array conversion
    const toppingsText = computed({
        get() {
            return currentOrder.value?.toppings?.join(', ') || '';
        },
        set(newValue) {
            if (currentOrder.value) {
                currentOrder.value.toppings = newValue
                    .split(',')
                    .map(item => item.trim())
                    .filter(item => item !== ''); // Remove empty strings
            }
        }
    });

    return {
        currentOrder,
        userDictionary,
        isSummaryCollapsed,
        showSuccessNotification: successToast.isVisible,
        processFinalResult,
        handleConfirmOrder,
        resetOrder,
        toppingsText,
        toggleSummaryCollapse: () => isSummaryCollapsed.value = !isSummaryCollapsed.value,
        addNickname,
        removeNickname,
        undoRemoveNickname,
        showUndoNotification: undoToast.isVisible,
        lastDeletedNickname
    };
}