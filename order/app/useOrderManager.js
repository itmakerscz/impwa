import { extractOrderData } from './parser.js';
import { saveOrder } from './storage.js';

const { ref, computed } = Vue;
const SPEECH_KEYWORDS = ["přidej", "chci navíc", "dej mi tam", "extra", "přidat", "přidejte"];

export function useOrderManager(transcript, speechSynthesizer, stopListening) {
    const currentOrder = ref(null);
    const isSummaryCollapsed = ref(false);
    const showSuccessNotification = ref(false);

    const processFinalResult = (text) => {
        let isCommand = false;

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

        if (!isCommand && !currentOrder.value) {
            const extracted = extractOrderData(text);
            console.log("Extracted order data:", extracted); // Log the extracted data for debugging
            currentOrder.value = extracted;
        }
    };

    const triggerSuccess = () => {
        showSuccessNotification.value = true;
        isSummaryCollapsed.value = true;
        setTimeout(() => {
            showSuccessNotification.value = false;
        }, 3000);
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
        isSummaryCollapsed,
        showSuccessNotification,
        processFinalResult,
        handleConfirmOrder,
        resetOrder,
        toppingsText,
        toggleSummaryCollapse: () => isSummaryCollapsed.value = !isSummaryCollapsed.value
    };
}