export class AudioProcessor {
    constructor(logger = console.warn) {
        this.audioCtx = null;
        this.analyser = null;
        this.micStream = null;
        this.animationId = null;
        this.log = logger;
    }

    async start(onVolumeUpdate) {
        try {
            // If context is missing or was previously closed, create a fresh one and its dependent nodes
            if (!this.audioCtx || this.audioCtx.state === 'closed') {
                this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                this.analyser = this.audioCtx.createAnalyser();
                this.analyser.fftSize = 64;
            }

            // Ensure AudioContext is resumed (critical for browsers that suspend it by default)
            if (this.audioCtx.state === 'suspended') {
                await this.audioCtx.resume();
            }

            this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const source = this.audioCtx.createMediaStreamSource(this.micStream);
            source.connect(this.analyser);
            const dataArray = new Uint8Array(this.analyser.frequencyBinCount);

            const update = () => {
                if (!this.micStream) return;
                this.analyser.getByteFrequencyData(dataArray);
                const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
                onVolumeUpdate(Math.min(100, average * 1.5));
                this.animationId = requestAnimationFrame(update);
            };
            this.animationId = requestAnimationFrame(update);
        } catch (err) {
            this.log("AudioProcessor error: " + err.message, 'error');
            throw err;
        }
    }

    stop() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        if (this.micStream) {
            this.micStream.getTracks().forEach(t => t.stop());
            this.micStream = null;
        }
        if (this.audioCtx) {
            this.audioCtx.close(); // Completely release resources for 2026 efficiency
        }
    }
}