// parser-worker.js
import { parseVoiceText } from './parser.js';

/**
 * Listens for parsing requests and executes them off-thread.
 */
self.addEventListener('message', (event) => {
    const { text, userDictionary, customMenu } = event.data;
    try {
        const result = parseVoiceText(text, userDictionary, customMenu);
        self.postMessage({ success: true, result });
    } catch (error) {
        self.postMessage({ success: false, error: error.message });
    }
});