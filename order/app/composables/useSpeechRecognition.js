import { AudioProcessor } from '../audio-processor.js';
import { SpeechSynthesizer } from '../speech-synthesizer.js';
import { useNotification } from './useNotification.js';

const { ref, onUnmounted } = Vue;

const ERROR_MESSAGES = {
    'not-allowed': "Přístup k mikrofonu byl zakázán. Zkontrolujte oprávnění v Android nastavení.",
    'no-speech': "Nebyl detekován žádný hlas. Zkuste mluvit hlasitěji.",
    'network': "Chyba sítě. Rozpoznávání hlasu na Androidu vyžaduje stabilní internet.",
    'audio-capture': "Mikrofon není k dispozici (možná ho používá jiná aplikace).",
    'service-not-allowed': "Služba Google Speech není v tomto prohlížeči povolena.",
    'aborted': "Rozpoznávání bylo přerušeno."
};

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export function useSpeechRecognition(onFinalResultCallback) {
    const isListening = ref(false);
    const transcript = ref("");
    const volumeLevel = ref(0);
    const recordingTime = ref(0);
    const lastError = ref("");
    const intentActive = ref(false); // Sleduje, zda uživatel skutečně chce nahrávat

    const errorToast = useNotification();

    // Reactive state for SpeechSynthesizer status
    const isSpeechSynthesizerSpeaking = ref(false);
    const speechSynthesizerQueueLength = ref(0);

    // Internal buffer for text recognized in previous "sessions" on mobile
    let baseTranscript = "";

    const audioProcessor = new AudioProcessor(); // Keep this
    const speechSynthesizer = new SpeechSynthesizer(
        'cs-CZ',
        (speaking) => isSpeechSynthesizerSpeaking.value = speaking,
        (queueLength) => speechSynthesizerQueueLength.value = queueLength
    );

    let recognition = null;
    let timerInterval = null;

    const isVoiceEnabled = ref(!!SpeechRecognition);

    if (isVoiceEnabled.value) {
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'cs-CZ';

        recognition.onstart = () => {
            isListening.value = true;
            lastError.value = ""; 
            if (navigator.vibrate) navigator.vibrate(50); // Haptic feedback on start
            errorToast.dismiss(); // Clear previous errors from UI
            if (!timerInterval) {
                recordingTime.value = 0; // Reset timer on start
                timerInterval = setInterval(() => {
                    recordingTime.value++;
                }, 1000);
            }
            audioProcessor.start((level) => {
                volumeLevel.value = level;
            });
        };

        recognition.onend = () => {
            // Pokud rozpoznávání skončilo, ale uživatel ho ručně nezastavil (intentActive),
            // restartujeme ho. To řeší problém s timeoutem na Androidu.
            if (intentActive.value) {
                console.log("Mobile timeout detected, auto-restarting...");
                baseTranscript = transcript.value; // Uložíme aktuální text jako základ pro další session
                try {
                    recognition.start();
                } catch (e) { console.error("Auto-restart failed", e); }
            } else {
                isListening.value = false;
                clearInterval(timerInterval);
                timerInterval = null;
                audioProcessor.stop();
                volumeLevel.value = 0;
                console.log("Recognition ended by user.");
                if (navigator.vibrate) navigator.vibrate(10);
            }
        };

        recognition.onerror = (event) => {
            console.error(`Speech Recognition Error (${event.error}):`, event);
            lastError.value = ERROR_MESSAGES[event.error] || `Chyba: ${event.error}`;
            errorToast.trigger(8000); // Errors persist longer to ensure they are read

            if (['not-allowed', 'audio-capture'].includes(event.error)) {
                stopListening();
            }
            clearInterval(timerInterval);
            timerInterval = null;
        };

        recognition.onresult = (event) => {
            let sessionTranscript = "";
            for (let i = 0; i < event.results.length; ++i) {
                sessionTranscript += event.results[i][0].transcript;
            }
            
            // Spojíme text z minulých restartů s aktuálním textem této session
            transcript.value = (baseTranscript + " " + sessionTranscript).trim();

            // Trigger the callback only for newly completed final segments
            for (let i = event.resultIndex; i < event.results.length; ++i) {
                if (event.results[i].isFinal) {
                    onFinalResultCallback(event.results[i][0].transcript.trim().toLowerCase());
                }
            }
        };
    }

    const startListening = async () => {
        if (!isVoiceEnabled.value) {
            alert("Hlasové ovládání není podporováno v tomto prohlížeči.");
            return false;
        }
        if (isListening.value) return false;

        try {
            intentActive.value = true;
            baseTranscript = ""; // Nový start - vyčistit základ
            if (navigator.permissions?.query) {
                const res = await navigator.permissions.query({ name: 'microphone' });
                if (res.state === 'denied') {
                    lastError.value = "Přístup k mikrofonu je zakázán. Povolte jej v nastavení prohlížeče.";
                    errorToast.trigger(8000);
                    return false;
                }
            }
            
            recognition.start();
            return true;
        } catch (e) {
            console.error("Mic start error:", e);
            lastError.value = "Nepodařilo se spustit mikrofon.";
            errorToast.trigger(8000);
            return false;
        }
    };

    const stopListening = () => {
        if (!isListening.value) return;
        intentActive.value = false; // Nastavíme, že uživatel chce opravdu končit
        recognition.stop();
        // onend will handle audioProcessor.stop() and timer cleanup
    };

    onUnmounted(() => {
        if (recognition) {
            recognition.stop();
            recognition = null;
        }
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        audioProcessor.stop();
    });

    return {
        isListening,
        transcript,
        volumeLevel,
        recordingTime,
        lastError,
        showErrorNotification: errorToast.isVisible,
        isVoiceEnabled,
        startListening,
        stopListening,
        speechSynthesizer, // Expose for speaking responses (and direct access to queue/isSpeaking if needed, though reactive refs are better)
        isSpeechSynthesizerSpeaking, // New: Expose reactive speaking status
        speechSynthesizerQueueLength // New: Expose reactive queue length
    };
}