export function useNotification() {
    const { ref } = Vue;
    const isVisible = ref(false);
    const queue = [];
    let timer = null;
    let isProcessing = false;

    const processQueue = () => {
        if (queue.length === 0) {
            isProcessing = false;
            isVisible.value = false;
            return;
        }

        isProcessing = true;
        const duration = queue.shift();
        isVisible.value = true;

        timer = setTimeout(() => {
            isVisible.value = false;
            // Add a small buffer delay to allow exit animations to complete 
            // before starting the next notification in the sequence.
            timer = setTimeout(processQueue, 500);
        }, duration);
    };

    const trigger = (duration = 3000) => {
        queue.push(duration);
        if (!isProcessing) processQueue();
    };

    const dismiss = () => {
        queue.length = 0;
        isVisible.value = false;
        isProcessing = false;
        if (timer) clearTimeout(timer);
    };

    return { isVisible, trigger, dismiss };
}