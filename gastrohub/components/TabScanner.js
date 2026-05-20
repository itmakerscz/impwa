const { defineComponent } = Vue;

export default defineComponent({
    props: ['isScannerActive', 'scannerError'],
    emits: ['start-scanner', 'stop-scanner'],
    template: `
        <section class="card" style="text-align: center;">
            <h3>📷 Hardwarový Scanner kódů</h3>
            <div style="margin: 15px 0;">
                <button v-if="!isScannerActive" @click="$emit('start-scanner')" style="background: #2c3e50; color: white; padding: 12px 24px; border:none; border-radius:4px; cursor:pointer;">Aktivovat kameru</button>
                <button v-else @click="$emit('stop-scanner')" style="background: #7f8c8d; color: white; padding: 12px 24px; border:none; border-radius:4px; cursor:pointer;">Vypnout kameru</button>
            </div>
            
            <div v-if="isScannerActive" style="position: relative; max-width: 400px; margin: 0 auto; background: #000; border-radius: 8px; overflow: hidden;">
                <video id="scanner-preview" style="width: 100%; height: auto; display: block;"></video>
                <div style="position: absolute; top: 50%; left: 50%; transform: translate(-25px, -25px); width: 50px; height: 50px; border: 2px dashed #e67e22;"></div>
            </div>

            <div v-if="scannerError" style="color: #c0392b; margin-top: 10px;">{{ scannerError }}</div>
        </section>
    `
});