const { ref, watch, onBeforeUnmount } = Vue;

// --- Constants & Configuration ---
const CONFIG = {
    LANG: 'cs-CZ',
    RESTART_DELAY_MS: 400, 
    DUPLICATE_THRESHOLD: 0.85,
    LOOKBACK_WINDOW_SIZE: 3,
    MAX_ERRORS_BEFORE_STOP: 3
};

// --- Pure Utilities (Outside Composable) ---
const normalizeText = (str) => str.toLowerCase().replace(/[\s.,\/#!$%\^&\*;:{}=\-_`~()]/g, "");

const getSimilarity = (str1, str2) => {
    const s1 = normalizeText(str1);
    const s2 = normalizeText(str2);
    if (s1 === s2) return 1.0;
    if (!s1 || !s2) return 0.0;

    // Levenshtein distance for better fuzzy matching on mobile
    const track = Array(s2.length + 1).fill(null).map(() => Array(s1.length + 1).fill(null));
    for (let i = 0; i <= s1.length; i += 1) track[0][i] = i;
    for (let j = 0; j <= s2.length; j += 1) track[j][0] = j;
    for (let j = 1; j <= s2.length; j += 1)
        for (let i = 1; i <= s1.length; i += 1)
            track[j][i] = s1[i - 1] === s2[j - 1] ? track[j - 1][i - 1] : Math.min(track[j - 1][i] + 1, track[j][i - 1] + 1, track[j - 1][i - 1] + 1);
    return 1 - (track[s2.length][s1.length] / Math.max(s1.length, s2.length));
};

const vibrate = (pattern) => {
    if ('vibrate' in navigator) {
        navigator.vibrate(pattern);
    }
};

// --- Main Composable ---
export function useSpeechRecognition(onInterim, onFinal, log, isProcessing) {
    const isListening = ref(false);
    const transcript = ref('');
    const interimTranscript = ref('');
    const recognition = ref(null);
    const committedParagraphs = ref([]);

    let isRestarting = false;
    let errorCount = 0;
    let lastStartedAt = 0;
    let renderPending = false;

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

    const processCommand = (text) => {
        const normalized = normalizeText(text);
        
        if (normalized.includes("novaobjednavka") || normalized.includes("nováobjednávka")) {
            log("Nová objednávka inicializována...", "info");
            vibrate([50, 30, 50]);
            resetTranscript();
            onFinal("nova objednavka");
            return true;
        }

        if (normalized.includes("ulozitobjednavku") || normalized.includes("uložitobjednávku")) {
            const cleanText = text
                .replace(/uložit\s+objednávku|ulozit\s+objednavku/gi, "")
                .replace(/\s+/g, " ")
                .trim();
            
            log("Objednávka se ukládá...", "success");
            vibrate(100);
            onFinal(`uložit objednávku ${cleanText}`);
            resetTranscript();
            return true;
        }
        return false;
    };

    const handleResult = (event) => {
        let currentInterim = '';
        const results = event.results;

        for (let i = event.resultIndex; i < results.length; ++i) {
            const res = results[i];
            const textSnippet = res[0].transcript;
            
            if (!textSnippet.trim() || (res[0].confidence === 0 && res.isFinal)) continue;

            if (res.isFinal) {
                if (!processCommand(textSnippet) && !isGhostDuplicate(textSnippet)) {
                    committedParagraphs.value.push(textSnippet.trim());
                    onFinal(textSnippet.trim());
                }
            } else {
                const lower = textSnippet.toLowerCase();
                if (lower.includes("nová objednávka") || lower.includes("uložit objednávku")) {
                    currentInterim = "⏳ Příkaz rozpoznán...";
                } else {
                    // Android Fix: Interim results usually contain the whole accumulated text.
                    // We strip the last committed paragraph to show only the currently spoken words.
                    const lastFinal = committedParagraphs.value[committedParagraphs.value.length - 1] || "";
                    const cleanInterim = textSnippet.toLowerCase().replace(lastFinal.toLowerCase(), "").trim();
                    currentInterim = cleanInterim;
                }
            }
        }

        // Optimized rendering for Android
        if (!renderPending) {
            renderPending = true;
            requestAnimationFrame(() => {
                transcript.value = committedParagraphs.value.join(' ');
                interimTranscript.value = currentInterim;
                onInterim(currentInterim);
                renderPending = false;
            });
        }
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
            errorCount = 0; 
            log(`Hlasový vstup aktivní (${CONFIG.LANG})`, "success");
            vibrate(30);
            wakeLockManager.request();
        };

        recognition.value.onend = () => {
            if (isListening.value && !isRestarting) {
                isRestarting = true;
                const timeSinceLastStart = Date.now() - lastStartedAt;
                // If it crashed immediately, wait longer before retry to avoid loop
                const delay = timeSinceLastStart < 1500 ? 2000 : CONFIG.RESTART_DELAY_MS;
                
                setTimeout(() => {
                    if (isListening.value) { 
                        try { recognition.value.start(); } catch (e) { isRestarting = false; }
                    }
                }, delay);
            } else if (!isListening.value) {
                wakeLockManager.release();
            }
        };


        recognition.value.onresult = handleResult;

        recognition.value.onerror = (event) => {
            const error = event.error;
            
            // Certain errors on Android mean we should stop trying
            if (error === 'not-allowed' || error === 'service-not-allowed') {
                log("Přístup k mikrofonu byl odmítnut.", "error");
                stop();
                return;
            }

            // Mobile specific: Network failure (common when switching WiFi/LTE)
            if (error === 'network') {
                log("Chyba sítě. Zkontrolujte připojení.", "error");
                vibrate([200, 100, 200]);
                stop();
                return;
            }

            if (error === 'aborted') {
                isRestarting = false;
                return;
            }

            if (error !== 'no-speech') {
                errorCount++;
                log(`Chyba řeči (${error})`, "warn");
                if (errorCount >= CONFIG.MAX_ERRORS_BEFORE_STOP) stop();
            }
        };

    };

    // --- Public API ---
    const start = () => {
        vibrate(40);
        if (!recognition.value) initRecognition();
        resetTranscript();
        isListening.value = true;
        isRestarting = false;
        lastStartedAt = Date.now();
        
        try {
            recognition.value.start();
        } catch (e) {
            // Handle case where recognition is already running or in a weird state
            try { recognition.value.stop(); } catch(err) {}
            setTimeout(() => { if(isListening.value) recognition.value.start(); }, 400);
        }
    };

    const stop = () => {
        vibrate([30, 30]);
        isListening.value = false;
        isRestarting = false;
        interimTranscript.value = '';
        
        try {
            if (recognition.value) {
                recognition.value.onend = null; // Prevent the restart loop
                recognition.value.stop();
            }
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