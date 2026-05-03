// app.js
import { Extractor } from './extractor.js';
const { createApp, ref, onMounted } = Vue;

createApp({
    setup() {
        const loading = ref(false);
        const items = ref([]);
        const form = ref({ phone: '', address: '', price: '' });
        const fileInput = ref(null); // Template Ref

        onMounted(() => {
            const saved = localStorage.getItem('receipt_store_v1');
            if (saved) items.value = JSON.parse(saved);
        });

        const triggerCam = () => {
            fileInput.value?.click(); // Safe access
        };

        const onFileSelect = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            loading.value = true;
            
            try {
                const worker = await Tesseract.createWorker('ces');
                const { data: { text } } = await worker.recognize(file);
                form.value = Extractor.extract(text);
                await worker.terminate();
            } catch (err) {
                console.error("OCR Error:", err);
            } finally {
                loading.value = false;
            }
        };

        const addItem = () => {
            items.value.unshift({ ...form.value, id: Date.now() });
            localStorage.setItem('receipt_store_v1', JSON.stringify(items.value));
            form.value = { phone: '', address: '', price: '' };
        };

        return { loading, form, items, fileInput, triggerCam, onFileSelect, addItem };
    }
}).mount('#app');
