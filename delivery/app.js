// app.js
import { Extractor } from './extractor.js';
const { createApp, ref, onMounted, computed } = Vue;

createApp({
    setup() {
        // --- State Management ---
        const loading = ref(false);
        const items = ref([]);
        const rawLines = ref([]); 
        const searchQuery = ref('');
        const filterMode = ref('day'); // day, week, month, all
        const fileInput = ref(null);

        // Form state initialized with today's metadata
        const form = ref({ 
            phone: '', 
            address: '', 
            price: '', 
            date: new Date().toLocaleDateString('cs-CZ'), 
            timestamp: Date.now() 
        });

        // --- Lifecycle ---
        onMounted(() => {
            const saved = localStorage.getItem('receipt_store_v2');
            if (saved) items.value = JSON.parse(saved);
            
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.register('./sw.js').catch(err => console.log(err));
            }
        });

        // --- Search & Filtering Logic ---
        const filteredItems = computed(() => {
            const query = searchQuery.value.toLowerCase().trim();
            
            // 1. Global Search Mode (Overrides date filters)
            if (query) {
                return items.value.filter(item => {
                    // Normalize phone search to handle the "+" character
                    const cleanQuery = query.replace('+', '');
                    const cleanPhone = item.phone?.replace('+', '') || '';
                    
                    const inPhone = cleanPhone.includes(cleanQuery);
                    const inAddr = item.address?.toLowerCase().includes(query);
                    const inPrice = item.price?.includes(query);
                    
                    return inPhone || inAddr || inPrice;
                });
            }

            // 2. History Filter Mode
            const now = new Date();
            return items.value.filter(item => {
                if (!item.timestamp) return false;
                const itemDate = new Date(item.timestamp);
                
                if (filterMode.value === 'day') {
                    return itemDate.toDateString() === now.toDateString();
                }
                
                if (filterMode.value === 'week') {
                    const startOfWeek = new Date(now);
                    const day = now.getDay();
                    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
                    startOfWeek.setDate(diff);
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

        // --- Actions ---
        const triggerCam = () => fileInput.value?.click();

        const resetForm = () => {
            const now = new Date();
            form.value = { 
                phone: '', 
                address: '', 
                price: '', 
                date: now.toLocaleDateString('cs-CZ'), 
                timestamp: now.getTime() 
            };
            rawLines.value = [];
        };

        const onFileSelect = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            loading.value = true;
            rawLines.value = [];
            
            try {
                const worker = await Tesseract.createWorker('ces');
                const { data: { text } } = await worker.recognize(file);
                
                // Show only lines starting with // in the debug view
                const allLines = text.split('\n').map(l => l.trim());
                rawLines.value = allLines.filter(l => l.startsWith('//'));

                // Extract data (Extractor only processes // lines)
                const result = Extractor.extract(text);
                const now = new Date();
                
                form.value = { 
                    ...result, 
                    date: now.toLocaleDateString('cs-CZ'),
                    timestamp: now.getTime() 
                };
                
                await worker.terminate();
            } catch (err) {
                console.error("OCR Error:", err);
            } finally {
                loading.value = false;
            }
        };

        const addItem = () => {
            if (!form.value.address && !form.value.price) return;
            
            items.value.unshift({ 
                ...form.value, 
                id: Date.now() 
            });
            
            localStorage.setItem('receipt_store_v2', JSON.stringify(items.value));
            resetForm();
        };

        const navigate = (address) => {
            if (!address) return;
            const encoded = encodeURIComponent(address);
            window.location.href = `waze://?q=${encoded}&navigate=yes`;
            
            setTimeout(() => {
                if (!document.hidden) {
                    window.open(`https://www.google.com/maps/search/?api=1&query=${encoded}`, '_blank');
                }
            }, 500);
        };

        return { 
            loading, items, rawLines, searchQuery, filterMode, form, fileInput,
            filteredItems, triggerCam, onFileSelect, addItem, resetForm, navigate 
        };
    }
}).mount('#app');
