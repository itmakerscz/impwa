// app.js
import { Extractor } from './extractor.js';
const { createApp, ref, onMounted, computed } = Vue;

createApp({
    setup() {
        const loading = ref(false);
        const items = ref([]);
        const rawLines = ref([]); 
        const searchQuery = ref(''); // New search state
        const form = ref({ phone: '', address: '', price: '', date: '' });
        const fileInput = ref(null);

        onMounted(() => {
            const saved = localStorage.getItem('receipt_store_v2');
            if (saved) items.value = JSON.parse(saved);
            
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.register('./sw.js').catch(err => console.log(err));
            }
        });

        // Computed logic: Filter by Search OR Default to Today's date
        const filteredItems = computed(() => {
            const query = searchQuery.value.toLowerCase().trim();
            const today = new Date().toLocaleDateString('cs-CZ');

            if (query) {
                // Full-text search across all fields in history
                return items.value.filter(item => 
                    item.address?.toLowerCase().includes(query) ||
                    item.phone?.includes(query) ||
                    item.price?.includes(query) ||
                    item.date?.includes(query)
                );
            }

            // Default view: Only items from today
            return items.value.filter(item => item.date === today);
        });

        const triggerCam = () => fileInput.value?.click();

        const onFileSelect = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            loading.value = true;
            try {
                const worker = await Tesseract.createWorker('ces');
                const { data: { text } } = await worker.recognize(file);
                
                // Log only lines starting with //
                const allLines = text.split('\n').map(l => l.trim());
                console.log("--- FILTERED LOG (//) ---");
                allLines.filter(l => l.startsWith('//')).forEach(l => console.log(l));

                rawLines.value = allLines.filter(l => l !== '');
                form.value = { 
                    ...Extractor.extract(text), 
                    date: new Date().toLocaleDateString('cs-CZ') 
                };
                
                await worker.terminate();
            } finally {
                loading.value = false;
            }
        };

        const addItem = () => {
            items.value.unshift({ ...form.value, id: Date.now() });
            localStorage.setItem('receipt_store_v2', JSON.stringify(items.value));
            form.value = { phone: '', address: '', price: '', date: '' };
            rawLines.value = [];
        };

        const callNum = (num) => window.location.href = `tel:${num}`;
        const navigate = (addr) => {
            const encoded = encodeURIComponent(addr);
            window.location.href = `waze://?q=${encoded}&navigate=yes`;
            setTimeout(() => { if (!document.hidden) window.open(`https://maps.google.com/?q=${encoded}`); }, 500);
        };

        return { 
            loading, form, items, rawLines, searchQuery, filteredItems, 
            fileInput, triggerCam, onFileSelect, addItem, callNum, navigate 
        };
    }
}).mount('#app');
