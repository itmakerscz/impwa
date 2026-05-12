export class SpeechSynthesizer {
    constructor(lang = 'cs-CZ') {
        this.lang = lang;
    }

    speak(text) {
        return new Promise((resolve) => {
            if (!window.speechSynthesis) {
                resolve();
                return;
            }
            // Clear any hung synthesis tasks
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = this.lang;
            utterance.onend = () => resolve();
            utterance.onerror = (event) => {
                console.error("SpeechSynthesisUtterance.onerror", event);
                resolve();
            };
            window.speechSynthesis.speak(utterance);
        });
    }
}