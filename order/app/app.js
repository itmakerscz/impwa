import { useSpeechRecognition } from './composables/useSpeechRecognition.js';
import { useOrderManager } from './composables/useOrderManager.js';
import { PIZZA_MENU } from './parser.js';

const { createApp, ref, onMounted, watch, nextTick, computed } = Vue;

/** Static menu terms escaped for Regex */
const STATIC_MENU_TERMS = PIZZA_MENU.flatMap(p => [p.name, ...(p.aliases || [])])
    .sort((a, b) => b.length - a.length) // Longest first to prevent partial matches
    .map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

const PHONE_REGEX = /\b((?:\+420|00420)?\s*[2-9]\d{2}(?:\s*\d{3}\s*\d{3}|\s*\d{5}))\b/g;

const autoResizeTextarea = (element) => {
    if (element) {
        element.style.height = 'auto';
        element.style.height = element.scrollHeight + 'px';
    }
};

createApp({
    setup() {
        const isDoneSpeaking = ref(false);
        const isProcessing = ref(false);
        const debugLogs = ref(JSON.parse(localStorage.getItem('pwa_debug_logs') || '[]'));
        const showDebugPanel = ref(false);
        const logFilter = ref('all');

        // Proxy console for mobile debugging
        const initConsoleProxy = () => {
            const types = ['log', 'warn', 'error'];
            types.forEach(type => {
                const original = console[type];
                console[type] = (...args) => {
                    original.apply(console, args);
                    const message = args.map(arg => {
                        try {
                            return typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
                        } catch (e) { return '[Complex Object]'; }
                    }).join(' ');
                    
                    debugLogs.value.push({
                        id: Date.now() + Math.random(),
                        type,
                        message,
                        time: new Date().toLocaleTimeString()
                    });
                    if (debugLogs.value.length > 100) debugLogs.value.shift();
                    localStorage.setItem('pwa_debug_logs', JSON.stringify(debugLogs.value));
                };
            });

            window.onerror = (msg, url, lineNo, columnNo, error) => {
                console.error(`Global Error: ${msg} at ${lineNo}:${columnNo}`);
            };

            window.onunhandledrejection = (event) => {
                console.error(`Promise Rejection: ${event.reason}`);
            };
        };

        initConsoleProxy();

        const addressTextarea = ref(null);
        const toppingsTextarea = ref(null);
        const captionTextarea = ref(null);
        const showDictionary = ref(false);
        const updateAvailable = ref(false);
        const newNickname = ref("");
        const selectedPizzaForNickname = ref("");
        let processingTimeout = null;
        let registrationWaiting = null;

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
            isSummaryCollapsed, showSuccessNotification, toggleSummaryCollapse,
            userDictionary, addNickname, removeNickname, 
            undoRemoveNickname, showUndoNotification, lastDeletedNickname
        } = manager;

        const {
            isListening,
            transcript,
            volumeLevel,
            recordingTime,
            lastError,
            showErrorNotification,
            isVoiceEnabled,
            isWakeLockActive,
            isWakeLockSupported,
            startListening,
            stopListening
        } = speech; // Destructure new reactive states
        const { isSpeechSynthesizerSpeaking, speechSynthesizerQueueLength } = speech;

        const speechStatusIcon = computed(() => {
            // If items are waiting, show the loudspeaker, otherwise the standard speaker
            return speechSynthesizerQueueLength.value > 0 ? 'campaign' : 'volume_up';
        });

        const filteredLogs = computed(() => {
            if (logFilter.value === 'all') return debugLogs.value;
            return debugLogs.value.filter(l => l.type === logFilter.value);
        });

        const copyLogs = () => {
            const text = debugLogs.value.map(l => `[${l.time}] [${l.type.toUpperCase()}] ${l.message}`).join('\n');
            navigator.clipboard.writeText(text).then(() => {
                alert('Logy zkopírovány do schránky.');
            }).catch(err => {
                console.error('Copy failed', err);
            });
        };

        const isSpeechQueueActive = computed(() => {
            return isSpeechSynthesizerSpeaking.value || speechSynthesizerQueueLength.value > 0;
        });

        /** 
         * Performance-optimized single-pass highlighter regex.
         * Combines static menu items with dynamic user nicknames.
         */
        const highlightRegex = computed(() => {
            const nicknames = (userDictionary.value || [])
                .map(d => d.nickname.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
            
            const allTerms = [...STATIC_MENU_TERMS, ...nicknames]
                .sort((a, b) => b.length - a.length);

            if (allTerms.length === 0) return null;
            // Použití Unicode Property Escapes \p{L} pro správné hranice slov s diakritikou
            return new RegExp(`(?<!\\p{L})(${allTerms.join('|')})(?!\\p{L})`, 'giu');
        });

        const highlightedTranscript = computed(() => {
            if (!transcript.value) return "";
            
            let text = transcript.value
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;");

            // 1. Highlight Pizza names and nicknames in one pass
            if (highlightRegex.value) {
                text = text.replace(highlightRegex.value, '<mark>$&</mark>');
            }

            // 2. Highlight potential phone numbers for better visual feedback
            text = text.replace(PHONE_REGEX, '<mark class="phone-highlight">$1</mark>');

            return text + (text.endsWith('\n') ? '' : '\n');
        });

        const updateTextareaHeights = () => {
            nextTick(() => {
                autoResizeTextarea(addressTextarea.value);
                autoResizeTextarea(toppingsTextarea.value);
                autoResizeTextarea(captionTextarea.value);
            });
        };

        // Unified Watcher for auto-resizing - covers voice input and manual edits
        watch([() => currentOrder.value?.address, toppingsText, transcript], () => {
            updateTextareaHeights();
        }, { immediate: true });

        const handleManualProcess = () => {
            if (!transcript.value) return;
            isProcessing.value = true;
            manager.processFinalResult(transcript.value);
            isProcessing.value = false;
            isDoneSpeaking.value = true;
        };

        const toggleRecording = async () => {
            if (!isVoiceEnabled.value) return;

            if (isListening.value) {
                stopListening();
                if (processingTimeout) clearTimeout(processingTimeout);
                isProcessing.value = true;
                processingTimeout = setTimeout(() => {
                    isProcessing.value = false;
                    isDoneSpeaking.value = true;
                }, 600);
            } else {
                isDoneSpeaking.value = false;
                await startListening();
            }
        };

        onMounted(() => {
            updateTextareaHeights();

            // Android-specific: Handle tab switching during long orders
            document.addEventListener('resume', () => {
                if (isListening.value) {
                    console.log("[Android] System resume detected, verifying hardware state...");
                }
            });

            // Register Service Worker
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.register('./service-worker.js').then(reg => {
                    console.log('[PWA] Service Worker registered');

                    // Check if there is already a waiting worker on page load
                    if (reg.waiting) {
                        registrationWaiting = reg.waiting;
                        updateAvailable.value = true;
                    }

                    // Listen for new workers being installed
                    reg.addEventListener('updatefound', () => {
                        const newWorker = reg.installing;
                        newWorker.addEventListener('statechange', () => {
                            // When the new worker is installed and waiting
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                registrationWaiting = newWorker;
                                updateAvailable.value = true;
                            }
                        });
                    });
                }).catch(err => console.error('[PWA] Service Worker registration failed', err));

                // Handle automatic refresh when a new service worker takes over
                let refreshing = false;
                navigator.serviceWorker.addEventListener('controllerchange', () => {
                    if (refreshing) return;
                    window.location.reload();
                    refreshing = true;
                });
            }
        });

        const refreshApp = () => {
            updateAvailable.value = false;
            if (registrationWaiting) {
                registrationWaiting.postMessage({ type: 'SKIP_WAITING' });
            }
        };

        const formatTime = (seconds) => {
            const mins = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return `${mins}:${secs.toString().padStart(2, '0')}`;
        };

        return {
            toggleRecording,
            handleManualProcess,
            isListening,
            highlightedTranscript,
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
            captionTextarea,   // Expose for the template
            isVoiceEnabled,
            autoResizeTextarea, // Expose the generic method
            volumeLevel,
            recordingTime,
            formatTime,
            lastError,
            isWakeLockActive,
            isWakeLockSupported,
            showErrorNotification,
            clearSpeechQueue: () => speech.speechSynthesizer.clearQueue(),
            isSpeechQueueActive, // Expose new computed property
            speechStatusIcon,    // Expose dynamic icon
            speechSynthesizerQueueLength, // Expose for the tooltip logic
            isSummaryCollapsed,
            toggleSummaryCollapse,
            showDictionary,
            newNickname,
            selectedPizzaForNickname,
            userDictionary,
            pizzas: PIZZA_MENU,
            handleAddNickname: () => {
                addNickname(newNickname.value, selectedPizzaForNickname.value);
                newNickname.value = "";
                selectedPizzaForNickname.value = "";
            },
            removeNickname: (nickname) => {
                if (confirm(`Opravdu chcete smazat přezdívku "${nickname}"?`)) {
                    removeNickname(nickname);
                }
            },
            undoRemoveNickname,
            showUndoNotification,
            lastDeletedNickname,
            updateAvailable,
            refreshApp,
            debugLogs, // Still expose for direct access if needed, though filteredLogs is used in UI
            filteredLogs,
            logFilter,
            showDebugPanel,
            copyLogs,
            clearLogs: () => { debugLogs.value = []; localStorage.removeItem('pwa_debug_logs'); }
        };
    }
}).mount('#app');
