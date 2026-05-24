const { ref, watch, onBeforeUnmount } = Vue;

// --- Constants & Configuration ---
const CONFIG = {
    LANG: 'cs-CZ',
    RESTART_DELAY_MS: 300,
    DUPLICATE_THRESHOLD: 0.85,
    LOOKBACK_WINDOW_SIZE: 4,
};

// --- Pure Utilities (Outside Composable) ---
const cleanString = (str) => str.toLowerCase().replace(/[\s.,\/#!$%\^&\*;:{}=\-_`~()]/g, "");

const getSimilarity = (str1, str2) => {
    const s1 = cleanString(str1);
    const s2 = cleanString(str2);
    if (s1 === s2) return 1.0;
    if (!s1 || !s2) return 0.0;
    if (s1.includes(s2) || s2.includes(s1)) return 0.9;
    return 0.0;
};

const isVoiceMacro = (textSnippet) => {
    const cleanSnippet = cleanString(textSnippet);
    const macros = ["novaobjednavka", "ulozitobjednavku", "nováobjednávka", "uložitobjednávku"];
    return macros.some(macro => cleanSnippet.includes(macro));
};

// --- Main Composable ---
export function useSpeechRecognition(onInterim, onFinal, log, isProcessing) {
    const isListening = ref(false);
    const transcript = ref('');
    const interimTranscript = ref('');
    const recognition = ref(null);
    const committedParagraphs = ref([]);
    
    let isRestarting = false; 

    // --- WakeLock Sub-module ---
    const wakeLockManager = {
        lock: null,
        async request() {
            if (!('wakeLock' in navigator)) return;
            try {
                if (this.lock) await this.release();
                this.lock = await navigator.wakeLock.request('screen');
                log("WakeLock aktivní - obrazovka nezhasne.", "info");
            } catch (e) {
                log(`WakeLock selhal: ${e.message}`, "warn");
            }
        },
        async release() {
            if (!this.lock) return;
            try {
                await this.lock.release();
            } catch (e) {
                // Silently catch if OS already released it
            } finally {
                this.lock = null;
            }
        }
    };

    // --- Recognition Logic ---
    const isGhostDuplicate = (textSnippet) => {
        const lookbackWindow = committedParagraphs.value.slice(-CONFIG.LOOKBACK_WINDOW_SIZE);
        return lookbackWindow.some(pastSentence => getSimilarity(pastSentence, textSnippet) > CONFIG.DUPLICATE_THRESHOLD);
    };

    const handleResult = (event) => {
        let currentInterim = '';
        const results = event.results;

        for (let i = event.resultIndex; i < results.length; ++i) {
            const res = results[i];
            const textSnippet = res[0].transcript.trim();
            
            if (!textSnippet || (res[0].confidence === 0 && res.isFinal)) continue;

            if (isVoiceMacro(textSnippet)) {
                if (res.isFinal) onFinal(textSnippet);
                currentInterim = "";
                continue;
            }

            if (res.isFinal) {
                if (!isGhostDuplicate(textSnippet)) {
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

    const initRecognition = () => {
        const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
        if (!SpeechRecognition) {
            log("Web Speech API není v tomto prohlížeči podporováno.", "error");
            return;
        }

        recognition.value = new SpeechRecognition();
        Object.assign(recognition.value, {
            continuous: true,
            interimResults: true,
            lang: CONFIG.LANG
        });

        recognition.value.onstart = () => {
            isListening.value = true;
            isRestarting = false;
            log(`Hlasový vstup aktivní (${CONFIG.LANG})`, "success");
            wakeLockManager.request();
        };

        recognition.value.onend = () => {
            if (isListening.value && !isRestarting) {
                isRestarting = true;
                setTimeout(() => {
                    if (isListening.value) {
                        try { recognition.value.start(); } 
                        catch (e) { isRestarting = false; }
                    }
                }, CONFIG.RESTART_DELAY_MS);
            } else if (!isListening.value) {
                wakeLockManager.release();
            }
        };

        recognition.value.onresult = handleResult;

        recognition.value.onerror = (event) => {
            if (event.error === 'aborted') {
                isRestarting = false; 
                return;
            }
            if (event.error !== 'no-speech') {
                log(`Chyba řeči: ${event.error}`, "error");
            }
        };
    };

    // --- Public API ---
    const start = () => {
        if (!recognition.value) initRecognition();
        resetTranscript();
        isListening.value = true;
        isRestarting = false;
        
        try {
            recognition.value.start();
        } catch (e) {
            recognition.value.stop();
            setTimeout(() => recognition.value.start(), 200);
        }
    };

    const stop = () => {
        isListening.value = false;
        isRestarting = false;
        interimTranscript.value = '';
        try {
            if (recognition.value) recognition.value.stop();
        } catch (e) { /* Already stopped */ }
        wakeLockManager.release();
    };

    const toggleListening = () => isListening.value ? stop() : start();

    const resetTranscript = () => {
        transcript.value = '';
        committedParagraphs.value = [];
        interimTranscript.value = '';
    };

    const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible' && isListening.value) {
            wakeLockManager.request();
            try { recognition.value.start(); } catch(e) { /* Safely running */ }
        }
    };

    // --- Lifecycle Hooks ---
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
