import { saveToDB } from './storage.js';

const { createApp, ref, computed } = Vue;
const artyom = new Artyom();

createApp({
    setup() {
        const transcript = ref('Klikněte na mikrofon a objednejte...');
        const isListening = ref(false);
        const order = ref(null);

        const statusMessage = computed(() => isListening.value ? "Poslouchám vás..." : "Připraven");

        // Simple Czech Extraction Logic
        const extractData = (text) => {
            const raw = text.toLowerCase();
            const phone = raw.replace(/\s/g, '').match(/\d{9}/)?.[0] || "Neuvedeno";
            const qty = raw.match(/\d+/)?.[0] || "1";
            const item = raw.match(/(?:pizzu|pizzy|pizza)\s+([a-zěščřžýáíéóúů\s]+?)(?=\sna|v\s|ulici|$)/i)?.[1] || "Margarita";
            const addr = raw.match(/(?:na adresu|ulici|ulice|do)\s+(.*)/i)?.[1]?.replace(phone, '').trim() || "Osobní odběr";

            return { item: `Pizza ${item}`, quantity: qty, address: addr, phone };
        };

        const toggleMic = () => {
            if (isListening.value) {
                artyom.fatality().then(() => isListening.value = false);
            } else {
                artyom.initialize({
                    lang: "cs-CZ",
                    continuous: false,
                    listen: true,
                    speed: 1
                }).then(() => {
                    isListening.value = true;
                    artyom.say("Co si dáte?");
                });
            }
        };

        artyom.redirectRecognizedTextOutput((text, isFinal) => {
            if (isFinal) {
                transcript.value = text;
                const result = extractData(text);
                order.value = result;
                saveToDB(result);
                artyom.say(`Uloženo. ${result.quantity} krát ${result.item}.`);
                isListening.value = false;
            }
        });

        const reset = () => { order.value = null; transcript.value = ''; };

        return { transcript, isListening, order, statusMessage, toggleMic, reset };
    }
}).mount('#app');
