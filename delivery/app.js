// app.js
import { Extractor } from './extractor.js';
const { createApp, ref, onMounted, computed } = Vue;

createApp({
    setup() {
        const loading = ref(false);
        const items = ref([]);
        const rawLines = ref([]); 
        const searchQuery = ref('');
        const filterMode = ref('day');
        const fileInput = ref(null);

        const form = ref({ phone: '', address: '', price: '', date: '', timestamp: 0 });

        onMounted(() => {
            const saved = localStorage.getItem('receipt_store_v2');
            if (saved) items.value = JSON.parse(saved);
        });

        const filteredItems = computed(() => {
            const query = searchQuery.value.toLowerCase().trim();
            if (query) {
                return items.value.filter(i => 
                    i.address?.toLowerCase().includes(query) || i.phone?.includes(query)
                );
            }

            const now = new Date();
            return items.value.filter(item => {
                if (!item.timestamp) return false;
                const d = new Date(item.timestamp);
                if (filterMode.value === 'day') return d.toDateString() === now.toDateString();
                if (filterMode.value === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
                if (filterMode.value === 'week') {
                    const start = new Date(now);
                    start.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
                    start.setHours(0,0,0,0);
                    return d >= start;
                }
                return true;
            });
        });

        const triggerCam = () => fileInput.value?.click();

        const resetForm = () => {
            form.value = { phone: '', address: '', price: '', date: '', timestamp: 0 };
            rawLines.value = [];
        };

        const onFileSelect = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            loading.value = true;
            try {
                const worker = await Tesseract.createWorker('ces');
                const { data: { text } } = await worker.recognize(file);
                const allLines = text.split('\n').map(l => l.trim());
                rawLines.value = allLines.filter(l => l !== '');
                
                const result = Extractor.extract(text);
                const now = new Date();
                form.value = { 
                    ...result, 
                    date: now.toLocaleDateString('cs-CZ'), 
                    timestamp: now.getTime() 
                };
                await worker.terminate();
            } finally {
                loading.value = false;
            }
        };

        const addItem = () => {
            if (!form.value.address && !form.value.price) return;
            const now = new Date();
            const entry = { 
                ...form.value, 
                id: Date.now(),
                date: form.value.date || now.toLocaleDateString('cs-CZ'),
                timestamp: form.value.timestamp || now.getTime()
            };
            items.value.unshift(entry);
            localStorage.setItem('receipt_store_v2', JSON.stringify(items.value));
            resetForm();
        };

        const navigate = (addr) => {
            const url = `waze://?q=${encodeURIComponent(addr)}&navigate=yes`;
            window.location.href = url;
            setTimeout(() => {
                if (!document.hidden) window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`);
            }, 500);
        };

        return { 
            loading, items, rawLines, searchQuery, filterMode, form, fileInput,
            filteredItems, triggerCam, onFileSelect, addItem, resetForm, navigate 
        };
    }
}).mount('#app');
