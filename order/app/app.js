import { extractOrderData } from './parser.js';
import { saveOrder } from './storage.js';
import { AudioProcessor } from './audio-processor.js';
import { SpeechSynthesizer } from './speech-synthesizer.js';

const { createApp, ref } = Vue;

createApp({
    setup() {
        const isListening = ref(false);
        const transcript = ref("");
        const currentOrder = ref(null);
        const volumeLevel = ref(0);
        const recordingTime = ref(0);
        const lastError = ref(""); // Track last error for UI feedback
        const isPTTActive = ref(false); // Track if user is currently holding the button
        const audioProcessor = new AudioProcessor();
        const speechSynthesizer = new SpeechSynthesizer();

        let timerInterval = null;
        
        // Native Web Speech API initialization
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const isVoiceEnabled = ref(!!SpeechRecognition);
        let recognition = null;

        if (isVoiceEnabled.value) {
            recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'cs-CZ';

            recognition.onstart = () => { 
                // Only start timer if not already running (handles mobile restarts)
                if (!timerInterval) {
                    timerInterval = setInterval(() => {
                        recordingTime.value++;
                    }, 1000);
                }
            };
            
            recognition.onend = () => { 
                // Only restart if we are NOT in Push-to-Talk mode 
                // or if the user is still holding the button
                if (isListening.value && isPTTActive.value) {
                    try {
                        // Small delay to prevent overlap errors on rapid restarts
                        setTimeout(() => {
                            if (isPTTActive.value) recognition.start();
                        }, 100);
                        return; // Keep visualizer and timer alive
                    } catch (e) {
                        console.error("Restart failed:", e);
                        isListening.value = false;
                    }
                }
                console.log("Recognition ended naturally.");
                clearInterval(timerInterval);
                timerInterval = null;
                audioProcessor.stop();
                volumeLevel.value = 0;
            };

            recognition.onerror = (event) => {
                console.error(`Speech Recognition Error (${event.error}):`, event);
                
                // Map technical errors to user-friendly messages
                const errorMessages = {
                    'not-allowed': "Přístup k mikrofonu byl zakázán. Zkontrolujte oprávnění v Android nastavení.",
                    'no-speech': "Nebyl detekován žádný hlas. Zkuste mluvit hlasitěji.",
                    'network': "Chyba sítě. Rozpoznávání hlasu na Androidu vyžaduje stabilní internet.",
                    'audio-capture': "Mikrofon není k dispozici (možná ho používá jiná aplikace).",
                    'service-not-allowed': "Služba Google Speech není v tomto prohlížeči povolena.",
                    'aborted': "Rozpoznávání bylo přerušeno."
                };

                lastError.value = errorMessages[event.error] || `Chyba: ${event.error}`;
                
                // Removed 'aborted' from this list to allow onend to restart 
                // if synthesis or mobile OS interrupted the mic.
                if (['not-allowed', 'audio-capture'].includes(event.error)) {
                    isListening.value = false;
                    isPTTActive.value = false;
                    audioProcessor.stop();
                    volumeLevel.value = 0;
                }
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

        const processFinalResult = (text) => {
            const keywords = ["přidej", "chci navíc", "dej mi tam", "extra", "přidat", "přidejte"];
            let isCommand = false;

            for (const key of keywords) {
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

        const handlePressStart = async (event) => {
            // Prevent default behavior (like scrolling or context menus)
            if (event.cancelable) event.preventDefault();
            
            if (!isVoiceEnabled.value) {
                alert("Hlasové ovládání není podporováno v tomto prohlížeči.");
                return;
            }

            if (isPTTActive.value) return;
            isListening.value = true; // Set immediately to catch early onend events
            isPTTActive.value = true;

            try {
                if (navigator.vibrate) navigator.vibrate(50); // Haptic feedback
                
                if (navigator.permissions?.query) {
                    const res = await navigator.permissions.query({ name: 'microphone' });
                    if (res.state === 'denied') {
                        lastError.value = "Přístup k mikrofonu je zakázán. Povolte jej v nastavení prohlížeče.";
                        isPTTActive.value = false;
                        return;
                    }
                }
                
                // 1. Reset timer
                recordingTime.value = 0;
                lastError.value = ""; // Clear errors on new attempt
                // 2. Immediate Start (Critical for mobile User Gesture)
                audioProcessor.start((level) => {
                    volumeLevel.value = level;
                });
                recognition.start();
                // 3. Prompt concurrently
                speechSynthesizer.speak("Poslouchám");
            } catch (e) {
                console.error("Mic start error:", e);
                isPTTActive.value = false;
            }
        };

        const handlePressEnd = () => {
            if (!isPTTActive.value) return;
            isPTTActive.value = false;
            isListening.value = false;
            audioProcessor.stop();
            volumeLevel.value = 0;
            if (recognition) recognition.stop();
            if (navigator.vibrate) navigator.vibrate(10);
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

                speechSynthesizer.speak("Objednávka byla uložena.");
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
            audioProcessor.stop();
            volumeLevel.value = 0;
            if (recognition) recognition.stop();
        };

        const formatTime = (seconds) => {
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        };

        return { handlePressStart, handlePressEnd, isListening, transcript, currentOrder, resetOrder, handleConfirmOrder, isVoiceEnabled, volumeLevel, recordingTime, formatTime, lastError };
    }
}).mount('#app');
