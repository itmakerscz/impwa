// app.js
import { Extractor } from './extractor.js';
const { createApp, ref, onMounted } = Vue;

createApp({
    setup() {
        const loading = ref(false);
        const items = ref([]);
        const rawLines = ref([]); // New ref for line-by-line view
        const form = ref({ phone: '', address: '', price: '' });
        const fileInput = ref(null);

        onMounted(() => {
            const saved = localStorage.getItem('receipt_store_v1');
            if (saved) items.value = JSON.parse(saved);
            
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.register('./sw.js').catch(err => console.log(err));
            }
        });

        const triggerCam = () => fileInput.value?.click();

        const onFileSelect = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            loading.value = true;
            rawLines.value = []; // Reset previous lines
            
            try {
                const worker = await Tesseract.createWorker('ces');
                const { data: { text } } = await worker.recognize(file);
                
                // Store raw lines for display
                rawLines.value = text.split('\n').filter(l => l.trim() !== '');
                
                // Extract structured data
                form.value = Extractor.extract(text);
                
                await worker.terminate();
            } catch (err) {
                console.error("OCR Error:", err);
            } finally {
                loading.value = false;
            }
        };

        const addItem = () => {
            if (!form.value.address && !form.value.price) return;
            items.value.unshift({ ...form.value, id: Date.now() });
            localStorage.setItem('receipt_store_v1', JSON.stringify(items.value));
            form.value = { phone: '', address: '', price: '' };
            rawLines.value = []; // Clear debug view after saving
        };

        const navigate = (address) => {
            const encoded = encodeURIComponent(address);
            window.location.href = `waze://?q=${encoded}&navigate=yes`;
            setTimeout(() => {
                if (!document.hidden) window.open(`https://maps.google.com/?q=${encoded}`, '_blank');
            }, 500);
        };

        return { 
            loading, form, items, rawLines, fileInput, 
            triggerCam, onFileSelect, addItem, navigate 
        };
    }
}).mount('#app');
