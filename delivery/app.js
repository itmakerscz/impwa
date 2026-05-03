// app.js
import { Extractor } from './extractor.js';
const { createApp, ref, onMounted } = Vue;

createApp({
    setup() {
        const loading = ref(false);
        const items = ref([]);
        const form = ref({ phone: '', address: '', price: '' });

        onMounted(() => {
            const saved = localStorage.getItem('receipt_data_v11');
            if (saved) items.value = JSON.parse(saved);
        });

        const triggerCam = () => document.getElementById('cam').click();

        const onFileSelect = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            loading.value = true;
            const worker = await Tesseract.createWorker('ces');
            
            try {
                const { data: { text } } = await worker.recognize(file);
                const result = Extractor.extract(text);
                
                form.value.phone = result.phone;
                form.value.address = result.address;
                form.value.price = result.price;
            } catch (err) {
                console.error("OCR Error:", err);
                alert("Chyba při čtení.");
            } finally {
                await worker.terminate();
                loading.value = false;
                e.target.value = ''; 
            }
        };

        const addItem = () => {
            items.value.unshift({ ...form.value, id: Date.now() });
            localStorage.setItem('receipt_data_v11', JSON.stringify(items.value));
            form.value = { phone: '', address: '', price: '' };
        };

        return { loading, form, items, triggerCam, onFileSelect, addItem };
    }
}).mount('#app');
