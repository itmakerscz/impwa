// app.js
import { Extractor } from './extractor.js';
const { createApp, ref, onMounted, computed } = Vue;

createApp({
    setup() {
        // --- STATE ---
        const loading = ref(false);
        const items = ref([]);
        const rawLines = ref([]); 
        const searchQuery = ref('');
        const filterMode = ref('day'); // Options: 'day', 'week', 'month', 'all'
        
        // Form state including timestamp for accurate filtering
        const form = ref({ 
            phone: '', 
            address: '', 
            price: '', 
            date: '', 
            timestamp: 0 
        });

        // Template Ref for the hidden file input
        const fileInput = ref(null);

        // --- LIFECYCLE ---
        onMounted(() => {
            const saved = localStorage.getItem('receipt_store_v2');
            if (saved) items.value = JSON.parse(saved);
            
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.register('./sw.js').catch(err => console.log("PWA SW error:", err));
            }
        });

        // --- COMPUTED (SEARCH & FILTERS) ---
        const filteredItems = computed(() => {
            const query = searchQuery.value.toLowerCase().trim();
            
            // If searching, ignore date filters and search everything
            if (query) {
                return items.value.filter(item => 
                    item.address?.toLowerCase().includes(query) ||
                    item.phone?.includes(query) ||
                    item.price?.includes(query) ||
                    item.date?.includes(query)
                );
            }

            // Date Filtering Logic
            const now = new Date();
            return items.value.filter(item => {
                if (!item.timestamp) return false;
                const itemDate = new Date(item.timestamp);
                
                if (filterMode.value === 'day') {
                    return itemDate.toDateString() === now.toDateString();
                }
                
                if (filterMode.value === 'week') {
                    // Calculate start of current week (Monday)
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

        // --- METHODS ---
        
        // This is the function that was missing from your return previously
        const triggerCam = () => {
            if (fileInput.value) {
                fileInput.value.click();
            }
        };

        const onFileSelect = async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            loading.value = true;
            rawLines.value = [];
            
            try {
                const worker = await Tesseract.createWorker('ces');
                const { data: { text } } = await worker.recognize(file);
                
                // Log only lines starting with // to console
                const allLines = text.split('\n').map(l => l.trim());
                console.log("--- SCAN LOG (//) ---");
                allLines.filter(l => l.startsWith('//')).forEach(l => console.log(l));

                // Update UI debug view
                rawLines.value = allLines.filter(l => l !== '');
                
                // Extract structured data using Extractor module
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
                alert("Nepodařilo se přečíst účtenku.");
            } finally {
                loading.value = false;
            }
        };

        const addItem = () => {
            if (!form.value.address && !form.value.price) return;
            
            items.value.unshift({ ...form.value, id: Date.now() });
            localStorage.setItem('receipt_store_v2', JSON.stringify(items.value));
            
            // Reset form and debug view
            form.value = { phone: '', address: '', price: '', date: '', timestamp: 0 };
            rawLines.value = [];
        };

        const navigate = (address) => {
            if (!address) return;
            const encoded = encodeURIComponent(address);
            
            // Try Waze deep link
            window.location.href = `waze://?q=${encoded}&navigate=yes`;
            
            // Fallback to Google Maps after 500ms if Waze doesn't open
            setTimeout(() => {
                if (!document.hidden) {
                    window.open(`https://www.google.com/maps/search/?api=1&query=${encoded}`, '_blank');
                }
            }, 500);
        };

        // --- EXPOSE TO TEMPLATE ---
        return {
            loading,
            items,
            rawLines,
            searchQuery,
            filterMode,
            form,
            fileInput,
            filteredItems,
            triggerCam,   // Now Vue can see @click="triggerCam"
            onFileSelect,
            addItem,
            navigate
        };
    }
}).mount('#app');
