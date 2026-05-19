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

        // Normalizace: malá písmena, odstranění diakritiky a interpunkce
        const normalize = (text) => {
            return text.toLowerCase()
                .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                .replace(/[\s.,\/#!$%\^&\*;:{}=\-_`~()]/g, " ")
                .trim()
                .split(/\s+/)
                .map(word => {
                    // Jednoduchý Czech Stemmer: odstranění pádových koncovek pro přesnější shodu
                    if (word.length <= 3) return word;
                    const suffixes = ['ove', 'ovi', 'ymi', 'ich', 'ach', 'ech', 'em', 'am', 'ho', 'mu', 'ou', 'u', 'a', 'e', 'i', 'y'];
                    for (const s of suffixes) {
                        if (word.endsWith(s)) return word.slice(0, -s.length);
                    }
                    return word;
                })
                .join("");
        };

        const s1 = normalize(str1);
        const s2 = normalize(str2);

        if (s1 === s2) return 1.0;

        // Levenshteinova vzdálenost pro výpočet fuzzy shody
        const levenshtein = (a, b) => {
            const matrix = Array.from({ length: a.length + 1 }, (_, i) => [i]);
            for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
            for (let i = 1; i <= a.length; i++) {
                for (let j = 1; j <= b.length; j++) {
                    const cost = a[i - 1] === b[j - 1] ? 0 : 1;
                    matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
                }
            }
            return matrix[a.length][b.length];
        };

        const dist = levenshtein(s1, s2);
        return 1 - dist / Math.max(s1.length, s2.length);
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
            requestWakeLock();
        };

        recognition.value.onend = () => {
            if (isListening.value) {
                recognition.value.start(); // Auto-restart for continuous flow
            } else {
                releaseWakeLock();
            }
        };

        recognition.value.onresult = (event) => {
            let currentInterim = '';
            const results = event.results;

            for (let i = event.resultIndex; i < results.length; ++i) {
                const res = results[i];
                const textSnippet = res[0].transcript;

                if (res.isFinal) {
                    // Prevent ghost duplicates (common in Chrome)
                    const lastWords = transcript.value.split(' ').slice(-3).join(' ');
                    if (getSimilarity(lastWords, textSnippet.trim()) < 0.8) {
                        transcript.value += (transcript.value ? ' ' : '') + textSnippet.trim();
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