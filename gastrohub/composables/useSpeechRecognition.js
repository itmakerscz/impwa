const { ref, watch, onBeforeUnmount } = Vue;

export function useSpeechRecognition(onInterim, onFinal, log, isProcessing) {
    const isListening = ref(false);
    const transcript = ref('');
    const interimTranscript = ref('');
    const recognition = ref(null);
    const wakeLock = ref(null);

    const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;

    const getSimilarity = (str1, str2) => {
        if (!str1 || !str2) return 0.0;
        const normalize = (text) => {
            return text.toLowerCase()
                .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                .replace(/[\s.,\/#!$%\^&\*;:{}=\-_`~()]/g, " ")
                .trim()
                .replace(/\s+/g, "");
        };
        const s1 = normalize(str1);
        const s2 = normalize(str2);
        if (s1 === s2) return 1.0;
        if (s1.includes(s2) || s2.includes(s1)) return 0.9;
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

                // Hlasová makra (Nová objednávka / Uložit)
                const cleanSnippet = textSnippet.toLowerCase().replace(/[\s.,]/g, "");
                if (cleanSnippet.includes("novaobjednavka") || cleanSnippet.includes("ulozitobjednavku")) {
                    if (res.isFinal) onFinal(textSnippet);
                    currentInterim = "";
                    continue;
                }

                if (res.isFinal) {
                    const lastText = transcript.value.split(' ').slice(-4).join(' ');
                    if (getSimilarity(lastText, textSnippet) < 0.85) {
                        transcript.value += (transcript.value ? ' ' : '') + textSnippet;
                        onFinal(transcript.value);
                    }
                } else {
                    currentInterim += textSnippet;
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
        interimTranscript.value = '';
        isListening.value = true;
        recognition.value.start();
    };

    const stop = () => {
        isListening.value = false;
        if (recognition.value) recognition.value.stop();
    };

    const toggleListening = () => {
        isListening.value ? stop() : start();
    };

    const resetTranscript = () => {
        transcript.value = '';
        interimTranscript.value = '';
    };

    onBeforeUnmount(() => {
        stop();
        releaseWakeLock();
    });

    // Re-request wake lock if tab becomes visible again
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && isListening.value) {
            requestWakeLock();
        }
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