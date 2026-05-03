// app.js
import { Extractor } from './extractor.js';
const { createApp, ref, onMounted } = Vue;

createApp({
    setup() {
        const loading = ref(false);
        const items = ref([]);
        const form = ref({ phone: '', address: '', price: '' });

        onMounted(() => {
            const saved = localStorage.getItem('receipt_store_v1');
            if (saved) items.value = JSON.parse(saved);
            
            // Register Service Worker for PWA
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.register('./sw.js');
            }
        });

        const onFileSelect = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            loading.value = true;
            const worker = await Tesseract.createWorker('ces');
            try {
                const { data: { text } } = await worker.recognize(file);
                const result = Extractor.extract(text);
                form.value = { ...result };
            } finally {
                await worker.terminate();
                loading.value = false;
            }
        };

        const addItem = () => {
            if (!form.value.address && !form.value.price) return;
            items.value.unshift({ ...form.value, id: Date.now() });
            localStorage.setItem('receipt_store_v1', JSON.stringify(items.value));
            form.value = { phone: '', address: '', price: '' };
        };

        const callNum = (num) => window.location.href = `tel:${num}`;
        
        const navigate = (addr) => {
            const encoded = encodeURIComponent(addr);
            // Try Waze deep link, fallback to Google Maps
            window.location.href = `waze://?q=${encoded}&navigate=yes`;
            setTimeout(() => { if (!document.hidden) window.open(`https://maps.google.com/?q=${encoded}`); }, 500);
        };

        return { loading, form, items, onFileSelect, addItem, callNum, navigate };
    }
}).mount('#app');
