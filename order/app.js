import { saveOrder } from './storage.js';
import { extractOrderData } from './parser.js';

const { createApp, ref, onMounted } = Vue;
const artyom = new Artyom();

createApp({
    setup() {
        const transcript = ref('');
        const isListening = ref(false);
        const currentOrder = ref(null);

        const startListening = () => {
            artyom.initialize({
                lang: "cs-CZ",
                continuous: false,
                listen: true,
                debug: true,
                speed: 1
            }).then(() => {
                isListening.value = true;
                artyom.say("Co si přejete objednat?");
            });
        };

        artyom.redirectRecognizedTextOutput((text, isFinal) => {
            if (isFinal) {
                transcript.value = text;
                const parsed = extractOrderData(text);
                currentOrder.value = parsed;
                saveOrder(parsed);
                artyom.say(`Rozumím, pizza ${parsed.item} na adresu ${parsed.address}.`);
                isListening.value = false;
            }
        });

        const toggleMic = () => {
            if (isListening.value) {
                artyom.fatality().then(() => isListening.value = false);
            } else {
                startListening();
            }
        };

        return { transcript, isListening, currentOrder, toggleMic };
    }
}).mount('#app');
