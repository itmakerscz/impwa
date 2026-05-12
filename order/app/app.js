import { extractOrderData } from './parser.js';
import { saveOrder } from './storage.js';

const { createApp, ref } = Vue;

createApp({
    setup() {
        const isListening = ref(false);
        const transcript = ref("");
        const currentOrder = ref(null);
        const volumeLevel = ref(0);

        let audioCtx = null;
        let analyser = null;
        let micStream = null;
        let animationId = null;
        
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
            
            recognition.onend = () => { 
                // Mobile Chrome specific: restart if user didn't manually stop
                if (isListening.value) {
                    try {
                        recognition.start();
                    } catch (e) {
                        console.error("Restart failed:", e);
                        isListening.value = false;
                    }
                }
            };

            recognition.onerror = (event) => {
                console.error("Speech Recognition Error:", event.error);
                if (event.error === 'not-allowed') isListening.value = false;
                if (event.error === 'aborted') isListening.value = false;
            };

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

        const startVisualizer = async () => {
            try {
                micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                analyser = audioCtx.createAnalyser();
                const source = audioCtx.createMediaStreamSource(micStream);
                source.connect(analyser);
                analyser.fftSize = 64;
                const dataArray = new Uint8Array(analyser.frequencyBinCount);

                const update = () => {
                    if (!isListening.value) return;
                    analyser.getByteFrequencyData(dataArray);
                    const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
                    volumeLevel.value = Math.min(100, average * 1.5);
                    animationId = requestAnimationFrame(update);
                };
                update();
            } catch (err) {
                console.warn("Visualizer error", err);
            }
        };

        const stopVisualizer = () => {
            if (animationId) cancelAnimationFrame(animationId);
            if (micStream) micStream.getTracks().forEach(t => t.stop());
            if (audioCtx) audioCtx.close();
            volumeLevel.value = 0;
        };

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
                isListening.value = false; // Set to false first to prevent onend restart
                stopVisualizer();
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
                    
                    // On mobile, speak then start to avoid hardware conflicts
                    speak("Poslouchám");
                    setTimeout(() => {
                        recognition.start();
                    }, 500);
                } catch (e) {
                    console.error("ToggleMic error:", e);
                }
            }
        };

        const handleConfirmOrder = async () => {
            if (!currentOrder.value) return;
            try {
                // Convert reactive Proxy to a plain object to prevent DataCloneError in IndexedDB
                const plainOrder = JSON.parse(JSON.stringify(currentOrder.value));
                plainOrder.rawText = transcript.value;
                await saveOrder(plainOrder);

                // Register Background Sync if supported
                if ('serviceWorker' in navigator && 'SyncManager' in window) {
                    const reg = await navigator.serviceWorker.ready;
                    try {
                        await reg.sync.register('sync-orders');
                    } catch (err) {
                        console.warn("Background sync registration failed", err);
                    }
                }

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
            isListening.value = false;
            stopVisualizer();
            if (recognition) recognition.stop();
        };

        return { toggleMic, isListening, transcript, currentOrder, resetOrder, handleConfirmOrder, isVoiceEnabled, volumeLevel };
    }
}).mount('#app');
