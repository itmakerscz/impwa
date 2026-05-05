// app.js
import { Extractor } from './extractor.js';
const { createApp, ref, onMounted, computed } = Vue;

createApp({
    setup() {
        const loading = ref(false);
        const items = ref([]);
        const rawLines = ref([]); 
        const searchQuery = ref('');
        const filterMode = ref('day'); // Options: 'day', 'week', 'month', 'all'
        const form = ref({ phone: '', address: '', price: '', date: '', timestamp: 0 });
        const fileInput = ref(null);

        onMounted(() => {
            const saved = localStorage.getItem('receipt_store_v2');
            if (saved) items.value = JSON.parse(saved);
        });

        const filteredItems = computed(() => {
            const query = searchQuery.value.toLowerCase().trim();
            
            // 1. If searching, ignore date filters and search everything
            if (query) {
                return items.value.filter(item => 
                    item.address?.toLowerCase().includes(query) ||
                    item.phone?.includes(query) ||
                    item.price?.includes(query)
                );
            }

            // 2. Date Filtering Logic
            const now = new Date();
            return items.value.filter(item => {
                const itemDate = new Date(item.timestamp);
                
                if (filterMode.value === 'day') {
                    return itemDate.toDateString() === now.toDateString();
                }
                
                if (filterMode.value === 'week') {
                    const startOfWeek = new Date(now);
                    startOfWeek.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1)); // Mon
                    startOfWeek.setHours(0,0,0,0);
                    return itemDate >= startOfWeek;
                }
                
                if (filterMode.value === 'month') {
                    return itemDate.getMonth() === now.getMonth() && 
                           itemDate.getFullYear() === now.getFullYear();
                }

                return true; // 'all' mode
            });
        });

        const onFileSelect = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            loading.value = true;
            try {
                const worker = await Tesseract.createWorker('ces');
                const { data: { text } } = await worker.recognize(file);
                const extracted = Extractor.extract(text);
                const now = new Date();
                
                form.value = { 
                    ...extracted, 
                    date: now.toLocaleDateString('cs-CZ'),
                    timestamp: now.getTime() 
                };
                await worker.terminate();
            } finally {
                loading.value = false;
            }
        };

        const addItem = () => {
            items.value.unshift({ ...form.value, id: Date.now() });
            localStorage.setItem('receipt_store_v2', JSON.stringify(items.value));
            form.value = { phone: '', address: '', price: '', date: '', timestamp: 0 };
        };

        return { 
            loading, form, items, rawLines, searchQuery, filterMode, 
            filteredItems, fileInput, onFileSelect, addItem 
        };
    }
}).mount('#app');
