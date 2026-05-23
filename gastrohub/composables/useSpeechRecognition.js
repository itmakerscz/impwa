import { ref, onBeforeUnmount } from 'vue';

export function useSpeechRecognition(onInterim, onFinal, log, isProcessing) {
    const isListening = ref(false);
    const transcript = ref('');
    const interimTranscript = ref('');
    const recognition = ref(null);
    const wakeLock = ref(null);
    const committedParagraphs = ref([]);
    
    // Safety flag to prevent concurrent start calls on Android restart loops
    let isRestarting = false; 

    const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;

    const getSimilarity = (str1, str2) => {
        const s1 = str1.toLowerCase().replace(/[\s.,\/#!$%\^&\*;:{}=\-_`~()]/g, "");
        const s2 = str2.toLowerCase().replace(/[\s.,\/#!$%\^&\*;:{}=\-_`~()]/g, "");
        if (s1 === s2) return 1.0;
        if (!s1 || !s2) return 0.0;
        // Android Specific: Enhanced heuristic for partial word overlapping
        if (s1.includes(s2) || s2.includes(s1)) return 0.9;
        return 0.0;
    };

    const requestWakeLock = async () => {
        if ('wakeLock' in navigator) {
            try {
                // Always clear old reference if it exists to prevent dead locks on mobile
                if (wakeLock.value) {
                    await releaseWakeLock();
                }
                wakeLock.value = await navigator.wakeLock.request('screen');
                log("WakeLock aktivní - obrazovka nezhasne.", "info");
            } catch (e) {
                log("WakeLock selhal: " + e.message, "warn");
            }
        }
    };

    const releaseWakeLock = async () => {
        if (wakeLock.value) {
            try {
                await wakeLock.value.release();
            } catch (e) {
                // Silently catch if already released by OS
            } finally {
                wakeLock.value = null;
            }
        }
    };

    const initRecognition = () => {
        if (!SpeechRecognition) {
            log("Web Speech API není v tomto prohlížeči podporováno.", "error");
            return;
        }

        recognition.value = new SpeechRecognition();
        recognition.value.continuous = true;
        recognition.value.interimResults = true;
        recognition.value.lang = 'cs-CZ';

        recognition.value.onstart = () => {
            isListening.value = true;
            isRestarting = false;
            log("Hlasový vstup aktivní (cs-CZ)", "success");
            requestWakeLock();
        };

        recognition.value.onend = () => {
            // Android Fix: If user didn't explicitly press stop, handle safe auto-restart
            if (isListening.value && !isRestarting) {
                isRestarting = true;
                // A short delay (300ms) gives Android OS time to completely release the audio channel
                setTimeout(() => {
                    if (isListening.value) {
                        try {
                            recognition.value.start();
                        } catch (e) {
                            // Safe fallback if instance is trapped in an active state
                            isRestarting = false;
                        }
                    }
                }, 300);
            } else if (!isListening.value) {
                releaseWakeLock();
            }
        };

        recognition.value.onresult = (event) => {
            let currentInterim = '';
            const results = event.results;

            for (let i = event.resultIndex; i < results.length; ++i) {
                const res = results[i];
                const textSnippet = res[0].transcript.trim();
                if (!textSnippet) continue;
                if (res[0].confidence === 0 && res.isFinal) continue;

                // Hlasová makra
                const cleanSnippet = textSnippet.toLowerCase().replace(/[\s.,\/#!$%\^&\*;:{}=\-_`~()]/g, "");
                if (cleanSnippet.includes("novaobjednavka") || cleanSnippet.includes("ulozitobjednavku") || 
                    cleanSnippet.includes("nováobjednávka") || cleanSnippet.includes("uložitobjednávku")) {
                    if (res.isFinal) onFinal(textSnippet);
                    currentInterim = "";
                    continue;
                }

                if (res.isFinal) {
                    let isGhostDuplicate = false;
                    
                    // Android Fix: Increase lookback window to 4 sentences due to frequent aggressive cuts
                    const lookbackWindow = committedParagraphs.value.slice(-4);
                    
                    for (let pastSentence of lookbackWindow) {
                        if (getSimilarity(pastSentence, textSnippet) > 0.85) {
                            isGhostDuplicate = true;
                            break;
                        }
                    }

                    if (!isGhostDuplicate) {
                        committedParagraphs.value.push(textSnippet);
                        transcript.value = committedParagraphs.value.join(' ');
                        onFinal(transcript.value);
                    }
                } else {
                    currentInterim += res[0].transcript;
                }
            }

            interimTranscript.value = currentInterim;
            onInterim(currentInterim);
        };

        recognition.value.onerror = (event) => {
            // Android often fires 'aborted' or 'no-speech' during long pauses. 
            // Treat them gently so it doesn't spam error logs.
            if (event.error === 'aborted') {
                isRestarting = false; // Allow onend to trigger recovery
                return;
            }
            if (event.error !== 'no-speech') {
                log(`Chyba řeči: ${event.error}`, "error");
            }
        };
    };

    const start = () => {
        if (!recognition.value) initRecognition();
        transcript.value = '';
        committedParagraphs.value = [];
        interimTranscript.value = '';
        isListening.value = true;
        isRestarting = false;
        
        try {
            recognition.value.start();
        } catch (e) {
            // If already running, stop it first to reset the hardware line
            recognition.value.stop();
            setTimeout(() => recognition.value.start(), 200);
        }
    };

    const stop = () => {
        isListening.value = false;
        isRestarting = false;
        interimTranscript.value = '';
        if (recognition.value) {
            try {
                recognition.value.stop();
            } catch (e) {
                // Already stopped
            }
        }
        releaseWakeLock();
    };

    const toggleListening = () => {
        isListening.value ? stop() : start();
    };

    const resetTranscript = () => {
        transcript.value = '';
        committedParagraphs.value = [];
        interimTranscript.value = '';
    };

    const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
            if (isListening.value) {
                requestWakeLock(); // Re-request fresh lock as Android breaks old ones
                
                // Android Fix: Check if recognition went cold while in background
                try {
                    recognition.value.start();
                } catch(e) {
                    // Already running safely
                }
            }
        }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    onBeforeUnmount(() => {
        stop();
        document.removeEventListener('visibilitychange', handleVisibilityChange);
    });

    return {
        isListening,
        transcript,
        interimTranscript,
        start,
        stop,
        toggleListening,
        resetTranscript
    };
}
