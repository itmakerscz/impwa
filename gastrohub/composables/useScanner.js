// composables/useScanner.js

const { ref, nextTick, onBeforeUnmount } = Vue;

export function useScanner({ log }) {
    const isScannerActive = ref(false);
    const scannedResult = ref(null);
    const scannerError = ref(null);
    let videoStream = null;

    const startScanner = async () => {
        scannerError.value = null;
        scannedResult.value = null;
        isScannerActive.value = true;
        try {
            videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
            await nextTick();
            const videoEl = document.getElementById('scanner-preview');
            if (videoEl) {
                videoEl.srcObject = videoStream;
                videoEl.play();
            }
        } catch (err) {
            const msg = "Kamera nedostupná: " + err.message;
            log(msg, 'error');
            isScannerActive.value = false;
        }
    };

    const stopScanner = () => {
        isScannerActive.value = false;
        if (videoStream) {
            videoStream.getTracks().forEach(t => t.stop());
            videoStream = null;
        }
    };

    onBeforeUnmount(stopScanner);

    return {
        isScannerActive,
        scannedResult, // Note: Actual scanning logic (e.g., using a library like QuaggaJS or ZXing) would go here. This composable only manages camera access.
        scannerError,
        startScanner,
        stopScanner
    };
}