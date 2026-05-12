import { extractOrderData } from '../parser.js';
import { saveOrder } from '../storage.js';

const { ref, computed } = Vue;
const SPEECH_KEYWORDS = ["přidej", "chci navíc", "dej mi tam", "extra", "přidat", "přidejte"];

export function useOrderManager(transcript, speechSynthesizer, onOrderSavedCallback, stopListening) {
    const currentOrder = ref(null);

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
            currentOrder.value = extractOrderData(text);
        }
    };

    const handleConfirmOrder = async () => {
        if (!currentOrder.value) return;
        try {
            // Convert reactive Proxy to a plain object to prevent DataCloneError in IndexedDB
            const plainOrder = JSON.parse(JSON.stringify(currentOrder.value));
            plainOrder.rawText = transcript.value;
            await saveOrder(plainOrder);

            speechSynthesizer.speak("Objednávka byla uložena.");
            onOrderSavedCallback(); // Trigger the success notification
            resetOrder();
        } catch (err) {
            console.error("Storage error:", err);
            alert("Nepodařilo se uložit objednávku.");
        }
    };

    const resetOrder = () => {
        currentOrder.value = null;
        transcript.value = "";
        stopListening(); // Stop recognition and reset related states
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
        processFinalResult,
        handleConfirmOrder,
        resetOrder,
        toppingsText // Expose the computed property for the template
    };
}