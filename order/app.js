const { createApp, ref, computed } = Vue;

createApp({
    setup() {
        const transcript = ref('');
        const isListening = ref(false);
        const order = ref(null);

        // Web Speech API
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.lang = 'cs-CZ';
        recognition.continuous = false;

        const statusMessage = computed(() => 
            isListening.value ? "Poslouchám..." : "Připraven k objednávce"
        );

        // Text-to-Speech (Voice reading back)
        const speak = (text) => {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'cs-CZ';
            window.speechSynthesis.speak(utterance);
        };

        const toggleListening = () => {
            if (isListening.value) {
                recognition.stop();
            } else {
                recognition.start();
                isListening.value = true;
            }
        };

        recognition.onresult = (event) => {
            const text = event.results[0][0].transcript;
            transcript.value = text;
            extractOrder(text);
            isListening.value = false;
        };

        recognition.onerror = () => { isListening.value = false; };
        recognition.onend = () => { isListening.value = false; };

        const extractOrder = (text) => {
            const lower = text.toLowerCase();
            
            const phone = (text.replace(/\s/g, '').match(/\d{9}/) || ["Neuvedeno"])[0];
            const quantity = (lower.match(/(\d+)\s*(?:x|krát|piz)/) || ["", "1"])[1];
            const pizzaType = (lower.match(/(?:pizzu|pizzy|pizza)\s+([a-zěščřžýáíéóúů\s]+?)(?=\sna|v\s|ulici|$)/i) || ["", "Margarita"])[1];
            const address = (lower.match(/(?:na adresu|ulici|ulice|v)\s+(.*)/i) || ["", "Osobní odběr"])[1].replace(phone, '').trim();

            order.value = { item: pizzaType, quantity, address, phone };
            
            // Persist to IndexedDB
            saveOrder(order.value);

            // Voice Feedback
            speak(`Rozumím. Objednávám ${quantity} krát pizzu ${pizzaType} na adresu ${address}.`);
        };

        const clearOrder = () => { order.value = null; transcript.value = ''; };

        return { transcript, isListening, statusMessage, order, toggleListening, clearOrder };
    }
}).mount('#app');
                                                                                    
