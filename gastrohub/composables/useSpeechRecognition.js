const { ref, watch, onBeforeUnmount } = Vue;

export function useSpeechRecognition(onInterim, onFinal, log, isProcessing) {
    const isListening = ref(false);
    const transcript = ref('');
    const interimTranscript = ref('');
    const recognition = ref(null);
    const wakeLock = ref(null);
    const committedParagraphs = ref([]);

    const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;

    const getSimilarity = (str1, str2) => {
        const s1 = str1.toLowerCase().replace(/[\s.,\/#!$%\^&\*;:{}=\-_`~()]/g, "");
        const s2 = str2.toLowerCase().replace(/[\s.,\/#!$%\^&\*;:{}=\-_`~()]/g, "");
        if (s1 === s2) return 1.0;
        if (!s1 || !s2) return 0.0;
        // Heuristic: check if one contains the other with a small length difference
        if (s1.includes(s2) && s1.length < s2.length + 5) return 0.9;
        if (s2.includes(s1) && s2.length < s1.length + 5) return 0.9;
        return 0.0;
    };

    const requestWakeLock = async () => {
        if ('wakeLock' in navigator && !wakeLock.value) {
            try {
                wakeLock.value = await navigator.wakeLock.request('screen');
                log("WakeLock aktivní - obrazovka nezhasne.", "info");
            } catch (e) {
                log("WakeLock selhal: " + e.message, "warn");
            }
        }
    };

    const releaseWakeLock = () => {
        if (wakeLock.value) {
            wakeLock.value.release().then(() => {
                wakeLock.value = null;
            });
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
            log("Hlasový vstup aktivní (cs-CZ)", "success");
            requestWakeLock();
        };

        recognition.value.onend = () => {
            if (isListening.value) {
                try {
                    recognition.value.start(); 
                } catch (e) {
                    setTimeout(() => isListening.value && recognition.value.start(), 300);
                }
            } else {
                releaseWakeLock();
            }
        };

        recognition.value.onresult = (event) => {
            let currentInterim = '';
            const results = event.results;

            for (let i = event.resultIndex; i < results.length; ++i) {
                const res = results[i];
                const textSnippet = res[0].transcript.trim();
                if (res[0].confidence === 0 && res.isFinal) continue;

                // Hlasová makra (Nová objednávka / Uložit)
                const cleanSnippet = textSnippet.toLowerCase().replace(/[\s.,\/#!$%\^&\*;:{}=\-_`~()]/g, "");
                if (cleanSnippet.includes("novaobjednavka") || cleanSnippet.includes("ulozitobjednavku") || 
                    cleanSnippet.includes("nováobjednávka") || cleanSnippet.includes("uložitobjednávku")) {
                    if (res.isFinal) onFinal(textSnippet);
                    currentInterim = "";
                    continue;
                }

                if (res.isFinal) {
                    // Klasická filtrace duplicit
                    let isGhostDuplicate = false;
                    const lookbackWindow = committedParagraphs.value.slice(-3);
                    
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
        recognition.value.start();
    };

    const stop = () => {
        isListening.value = false;
        interimTranscript.value = '';
        if (recognition.value) recognition.value.stop();
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
        if (document.visibilityState === 'visible' && isListening.value) {
            requestWakeLock();
        }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    onBeforeUnmount(() => {
        stop();
        releaseWakeLock();
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