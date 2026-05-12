        const isListening = ref(false);
        const transcript = ref("");
        const currentOrder = ref(null);
        
        // Native Web Speech API initialization
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const isVoiceEnabled = ref(!!SpeechRecognition);
        let recognition = null;

        if (isVoiceEnabled.value) {
            recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'cs-CZ';

            recognition.onstart = () => { isListening.value = true; };
            recognition.onend = () => { isListening.value = false; };

            recognition.onresult = (event) => {
                let interimTranscript = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    const text = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        processFinalResult(text.trim().toLowerCase());
                        transcript.value = text;
                    } else {
                        interimTranscript += text;
                        transcript.value = interimTranscript;
                    }
                }
            };
        }

        const speak = (text) => {
            if (!window.speechSynthesis) return;
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = 'cs-CZ';
            window.speechSynthesis.speak(utterance);
        };

        const processFinalResult = (text) => {
            const keywords = ["přidej", "chci navíc", "dej mi tam", "extra", "přidat", "přidejte"];
            let isCommand = false;

            for (const key of keywords) {
                if (text.includes(key)) {
                    const topping = text.split(key).pop().trim();
                    if (topping && currentOrder.value) {
                        currentOrder.value.toppings.push(topping);
                        speak(`Přidávám ${topping}`);
                        isCommand = true;
                        break;
                    }
                }
            }

            if (!isCommand && !currentOrder.value) {
                currentOrder.value = extractOrderData(text);
            }
        };

        const toggleMic = async () => {
            if (!isVoiceEnabled.value) {
                alert("Hlasové ovládání není podporováno v tomto prohlížeči.");
                return;
            }

            if (isListening.value) {
                recognition.stop();
            } else {
                try {
                    if (navigator.permissions?.query) {
                        const res = await navigator.permissions.query({ name: 'microphone' });
                        if (res.state === 'denied') {
                            alert("Povolte prosím mikrofon v nastavení prohlížeče.");
                            return;
                        }
                    }
                    recognition.start();
                    speak("Poslouchám");
                } catch (e) {
                    recognition.start();
                }
            }
        };

        const handleConfirmOrder = async () => {
            if (!currentOrder.value) return;
            try {
                await saveOrder(currentOrder.value);
                speak("Objednávka byla uložena.");
                resetOrder();
            } catch (err) {
                console.error("Storage error:", err);
                alert("Nepodařilo se uložit objednávku.");
            }
        };

        const resetOrder = () => {
            currentOrder.value = null;
            transcript.value = "";
            if (isListening.value) recognition.stop();
        };

        return { toggleMic, isListening, transcript, currentOrder, resetOrder, handleConfirmOrder, isVoiceEnabled };
    }
}).mount('#app');
