import { AudioProcessor } from './audio-processor.js';
import { SpeechSynthesizer } from './speech-synthesizer.js';

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
    const isPTTActive = ref(false); // Push-to-Talk active state

    // Reactive state for SpeechSynthesizer status
    const isSpeechSynthesizerSpeaking = ref(false);
    const speechSynthesizerQueueLength = ref(0);

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
            if (navigator.vibrate) navigator.vibrate(50); // Haptic feedback on start
            lastError.value = ""; // Clear previous errors
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
            // Only restart if we are in Push-to-Talk mode AND the user is still holding the button
            if (isPTTActive.value) {
                try {
                    // Small delay to prevent overlap errors on rapid restarts
                    setTimeout(() => {
                        if (isPTTActive.value) recognition.start();
                    }, 100);
                    return; // Keep visualizer and timer alive
                } catch (e) {
                    console.error("Recognition restart failed:", e);
                    isListening.value = false;
                    isPTTActive.value = false;
                }
            } else {
                isListening.value = false;
                clearInterval(timerInterval);
                timerInterval = null;
                audioProcessor.stop();
                volumeLevel.value = 0;
                console.log("Recognition ended naturally.");
                if (navigator.vibrate) navigator.vibrate(10); // Haptic feedback on end
            }
        };

        recognition.onerror = (event) => {
            console.error(`Speech Recognition Error (${event.error}):`, event);
            lastError.value = ERROR_MESSAGES[event.error] || `Chyba: ${event.error}`;

            if (['not-allowed', 'audio-capture'].includes(event.error)) {
                isListening.value = false;
                isPTTActive.value = false;
                audioProcessor.stop();
                volumeLevel.value = 0;
            }
            clearInterval(timerInterval);
            timerInterval = null;
        };

        recognition.onresult = (event) => {
            let fullTranscript = "";
            for (let i = 0; i < event.results.length; ++i) {
                fullTranscript += event.results[i][0].transcript;
            }
            transcript.value = fullTranscript;

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
        if (isPTTActive.value) return false; // Already active

        isPTTActive.value = true;
        try {
            if (navigator.permissions?.query) {
                const res = await navigator.permissions.query({ name: 'microphone' });
                if (res.state === 'denied') {
                    lastError.value = "Přístup k mikrofonu je zakázán. Povolte jej v nastavení prohlížeče.";
                    isPTTActive.value = false;
                    return false;
                }
            }
            
            recognition.start();
            speechSynthesizer.speak("Poslouchám");
            return true;
        } catch (e) {
            console.error("Mic start error:", e);
            lastError.value = "Nepodařilo se spustit mikrofon.";
            isPTTActive.value = false;
            return false;
        }
    };

    const stopListening = () => {
        if (!isPTTActive.value) return;
        isPTTActive.value = false;
        if (recognition) recognition.stop();
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
        isPTTActive,
        isVoiceEnabled,
        startListening,
        stopListening,
        speechSynthesizer, // Expose for speaking responses (and direct access to queue/isSpeaking if needed, though reactive refs are better)
        isSpeechSynthesizerSpeaking, // New: Expose reactive speaking status
        speechSynthesizerQueueLength // New: Expose reactive queue length
    };
}