import { useSpeechRecognition } from './useSpeechRecognition.js';
import { useOrderManager } from './useOrderManager.js';

const { createApp, ref, onMounted, watch, nextTick, computed } = Vue;

createApp({
    setup() {
        const isDoneSpeaking = ref(false);
        const isProcessing = ref(false);
        const addressTextarea = ref(null);
        const toppingsTextarea = ref(null);

        // 1. Initialize Speech
        const speech = useSpeechRecognition((text) => {
            manager.processFinalResult(text);
            isProcessing.value = false; // Stop spinning once data is extracted
        });

        // 2. Initialize Manager
        const manager = useOrderManager(
            speech.transcript,
            speech.speechSynthesizer,
            speech.stopListening
        );

        const { 
            currentOrder, handleConfirmOrder, resetOrder, toppingsText, 
            isSummaryCollapsed, showSuccessNotification, toggleSummaryCollapse 
        } = manager;

        const {
            isListening,
            transcript,
            volumeLevel,
            recordingTime,
            lastError,
            isPTTActive,
            isVoiceEnabled,
            startListening,
            stopListening
        } = speech; // Destructure new reactive states
        const { isSpeechSynthesizerSpeaking, speechSynthesizerQueueLength } = speech;


        const autoResizeTextarea = (element) => {
            if (element) {
                element.style.height = 'auto';
                element.style.height = element.scrollHeight + 'px';
            }
        };

        const speechStatusIcon = computed(() => {
            // If items are waiting, show the loudspeaker, otherwise the standard speaker
            return speechSynthesizerQueueLength.value > 0 ? 'campaign' : 'volume_up';
        });

        const isSpeechQueueActive = computed(() => {
            return isSpeechSynthesizerSpeaking.value || speechSynthesizerQueueLength.value > 0;
        });

        // Unified Watcher for auto-resizing
        watch([() => currentOrder.value?.address, toppingsText], () => {
            nextTick(() => {
                autoResizeTextarea(addressTextarea.value);
                autoResizeTextarea(toppingsTextarea.value);
            });
        });

        const handlePressStart = async (event) => {
            // Prevent default behavior (like scrolling or context menus)
            if (event.cancelable) event.preventDefault();
            isDoneSpeaking.value = false;
            await startListening();
        };

        const handlePressEnd = () => {
            // If we are still listening when released, show the processing state
            if (isListening.value) {
                isProcessing.value = true;
                // 2026 Resilience: Safety timeout if Speech API hangs
                processingTimeout = setTimeout(() => {
                    if (isProcessing.value) {
                        isProcessing.value = false;
                        lastError.value = "Zpracování trvá příliš dlouho. Zkuste to znovu.";
                    }
                }, 5000);
            }
            stopListening();
            isDoneSpeaking.value = true;
            nextTick(() => {
                autoResizeTextarea(addressTextarea.value);
                autoResizeTextarea(toppingsTextarea.value);
            });
        };

        onMounted(() => {
            if (addressTextarea.value) nextTick(() => autoResizeTextarea(addressTextarea.value));
            if (toppingsTextarea.value) nextTick(() => autoResizeTextarea(toppingsTextarea.value));
        });

        const formatTime = (seconds) => {
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        };

        return {
            handlePressStart,
            handlePressEnd,
            isListening,
            transcript,
            isProcessing,
            isDoneSpeaking,
            currentOrder,
            resetOrder,
            handleConfirmOrder,
            showSuccessNotification,
            toppingsText,
            addressTextarea,
            toppingsTextarea, // Expose the new ref
            isVoiceEnabled,
            autoResizeTextarea, // Expose the generic method
            volumeLevel,
            recordingTime,
            formatTime,
            lastError,
            clearSpeechQueue: () => speech.speechSynthesizer.clearQueue(),
            isSpeechQueueActive, // Expose new computed property
            speechStatusIcon,    // Expose dynamic icon
            speechSynthesizerQueueLength, // Expose for the tooltip logic
            isSummaryCollapsed,
            toggleSummaryCollapse
        };
    }
}).mount('#app');
