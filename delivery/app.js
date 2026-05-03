// app.js
import { Extractor } from './extractor.js';
const { createApp, ref, onMounted } = Vue;

createApp({
    setup() {
        const loading = ref(false);
        const items = ref([]);
        const form = ref({ phone: '', address: '', price: '' });
        const fileInput = ref(null); // Ref for the hidden camera input

        // Initialize App
        onMounted(() => {
            const saved = localStorage.getItem('receipt_store_v1');
            if (saved) items.value = JSON.parse(saved);
            
            // Register PWA Service Worker
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.register('./sw.js').catch(err => console.log(err));
            }
        });

        // Safe camera trigger using Vue Ref
        const triggerCam = () => {
            if (fileInput.value) fileInput.value.click();
        };

        const onFileSelect = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            loading.value = true;
            try {
                const worker = await Tesseract.createWorker('ces'); // Czech language support
                const { data: { text } } = await worker.recognize(file);
                
                // Extract data using our specialized patterns
                const extracted = Extractor.extract(text);
                form.value = { ...extracted };
                
                await worker.terminate();
            } catch (err) {
                console.error("OCR Error:", err);
                alert("Nepodařilo se přečíst účtenku.");
            } finally {
                loading.value = false;
            }
        };

        const addItem = () => {
            if (!form.value.address && !form.value.price) return;
            
            items.value.unshift({ ...form.value, id: Date.now() });
            localStorage.setItem('receipt_store_v1', JSON.stringify(items.value));
            
            // Reset form
            form.value = { phone: '', address: '', price: '' };
        };

        // Navigation logic with fallback
        const navigate = (address) => {
            if (!address) return;
            const encoded = encodeURIComponent(address);
            
            // Try Waze deep link
            window.location.href = `waze://?q=${encoded}&navigate=yes`;
            
            // Fallback: If browser is still open after 500ms, open Google Maps
            setTimeout(() => {
                if (!document.hidden) {
                    window.open(`https://www.google.com/maps/search/?api=1&query=${encoded}`, '_blank');
                }
            }, 500);
        };

        return { 
            loading, form, items, fileInput, 
            triggerCam, onFileSelect, addItem, navigate 
        };
    }
}).mount('#app');
