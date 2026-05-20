// composables/useSpeech.js
import { SpeechSynthesizer } from '../speech-synthesizer.js';

const { ref, onBeforeUnmount } = Vue;

export function useSpeech(logger = console.warn) {
    const isSpeaking = ref(false);
    const speechQueueLength = ref(0);

    const synthesizer = new SpeechSynthesizer('cs-CZ', (speaking) => isSpeaking.value = speaking, (queueLength) => speechQueueLength.value = queueLength, logger);

    const speak = (text) => synthesizer.speak(text);

    onBeforeUnmount(() => synthesizer.clearQueue());

    return { speak, isSpeaking, speechQueueLength };
}