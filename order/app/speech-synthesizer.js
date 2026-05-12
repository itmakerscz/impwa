export class SpeechSynthesizer {
    constructor(lang = 'cs-CZ', onSpeakingChange = () => {}, onQueueChange = () => {}) {
        this.lang = lang;
        this.queue = [];
        this.isSpeaking = false;
        this.onSpeakingChange = onSpeakingChange;
        this.onQueueChange = onQueueChange;
    }

    speak(text) {
        return new Promise((resolve) => {
            if (!window.speechSynthesis) {
                console.warn("SpeechSynthesis not supported in this browser.");
                resolve();
                return;
            }

            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = this.lang;
            
            // Resolve the promise when this specific utterance ends
            utterance.onend = () => {
                resolve();
                this.setIsSpeaking(false);
                this.processQueue(); // Speak the next item in the queue
            };
            utterance.onerror = (event) => {
                console.error("SpeechSynthesisUtterance.onerror", event);
                resolve();
                this.setIsSpeaking(false);
                this.processQueue(); // Move to the next item even if current one failed
            };

            this.queue.push(utterance); // Add to queue
            this.onQueueChange(this.queue.length); // Notify queue change
            this.processQueue();
        });
    }

    processQueue() {
        if (this.isSpeaking || this.queue.length === 0) {
            return; // Already speaking or nothing in queue
        }

        const utterance = this.queue.shift(); // Get the next utterance from the front of the queue
        this.onQueueChange(this.queue.length); // Notify queue change
        this.setIsSpeaking(true);
        window.speechSynthesis.speak(utterance);
    }

    // Optional: Add a method to clear the queue if needed
    clearQueue() {
        window.speechSynthesis.cancel(); // Stop current speech
        this.queue = [];
        this.onQueueChange(this.queue.length); // Notify queue change
        this.setIsSpeaking(false);
    }

    // Helper to update isSpeaking and notify
    setIsSpeaking(value) {
        if (this.isSpeaking !== value) {
            this.isSpeaking = value;
            this.onSpeakingChange(value); // Notify speaking status change
        }
    }
}