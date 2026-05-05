// app.js
import { Extractor } from './extractor.js';
const { createApp, ref, onMounted } = Vue;

createApp({
    setup() {
        const loading = ref(false);
        const items = ref([]);
        const rawLines = ref([]); 
        const form = ref({ phone: '', address: '', price: '' });
        const fileInput = ref(null);

        onMounted(() => {
            const saved = localStorage.getItem('receipt_store_v1');
            if (saved) items.value = JSON.parse(saved);
            
            // Register PWA Service Worker
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.register('./sw.js').catch(err => console.log("SW error:", err));
            }
        });

        const triggerCam = () => fileInput.value?.click();

        const onFileSelect = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            loading.value = true;
            rawLines.value = [];
            
            try {
                const worker = await Tesseract.createWorker('ces');
                const { data: { text } } = await worker.recognize(file);
                
                // Set raw data for line-by-line debugging
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
            
            // Reset state
            form.value = { phone: '', address: '', price: '' };
            rawLines.value = [];
        };

        const callNum = (num) => window.location.href = `tel:${num}`;

        const navigate = (addr) => {
            const encoded = encodeURIComponent(addr);
            // Try Waze deep link
            window.location.href = `waze://?q=${encoded}&navigate=yes`;
            // Fallback to Google Maps if Waze is not installed
            setTimeout(() => {
                if (!document.hidden) window.open(`https://www.google.com/maps/search/?api=1&query=${encoded}`);
            }, 500);
        };

        return { loading, form, items, rawLines, fileInput, triggerCam, onFileSelect, addItem, callNum, navigate };
    }
}).mount('#app');
