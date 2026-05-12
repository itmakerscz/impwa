import { extractOrderData } from './parser.js';

const { createApp, ref } = Vue;

createApp({
    setup() {
        const isListening = ref(false);
        const transcript = ref("");
        const currentOrder = ref(null);
        const artyom = new Artyom();

        // Register Topping Commands
        artyom.addCommands([
            {
                indexes: ["přidej *", "chci navíc *", "dej mi tam *", "extra *"],
                smart: true,
                action: (i, wildcard) => {
                    if (currentOrder.value) {
                        currentOrder.value.toppings.push(wildcard.trim());
                        artyom.say(`Rozumím, přidávám ${wildcard}`);
                    }
                }
            }
        ]);

        artyom.redirectRecognizedTextOutput((text, isFinal) => {
            if (isFinal) {
                transcript.value = text;
                if (!currentOrder.value) {
                    currentOrder.value = extractOrderData(text);
                }
            }
        });

const toggleMic = async () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        alert("Hlasové ovládání není v tomto prohlížeči podporováno. Zkuste prosím Google Chrome.");
        return;
    }

    if (isListening.value) {
        stopListening();
    } else {
        try {
            if (navigator.permissions && navigator.permissions.query) {
                const res = await navigator.permissions.query({ name: 'microphone' });
                if (res.state === 'denied') {
                    alert("Povolte prosím mikrofon v nastavení prohlížeče.");
                    return;
                }
            }
            startListening();
        } catch (e) {
            startListening();
        }
    }
};

const startListening = () => {
    artyom.initialize({
        lang: "cs-CZ",
        continuous: true,
        listen: true,
        debug: false,
        speed: 1
    }).then(() => {
        isListening.value = true;
        artyom.say("Poslouchám vaši objednávku.");
    });
};

const stopListening = () => {
    artyom.fatality().then(() => {
        isListening.value = false;
    });
};

        return { toggleMic, isListening, transcript, currentOrder };
    }
}).mount('#app');
