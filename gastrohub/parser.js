// parser.js
export const PIZZA_MENU = [
    { id: 1, name: "Margherita", category: "pizza", prepTime: 300 },
    { id: 2, name: "Šunková", category: "pizza", prepTime: 300 },
    { id: 3, name: "Slaninová", category: "pizza", prepTime: 300 },
    { id: 4, name: "Quatro", category: "pizza", prepTime: 300 },
    { id: 5, name: "Salamová", category: "pizza", prepTime: 300 },
    { id: 6, name: "Fungi", category: "pizza", prepTime: 300 },
    { id: 7, name: "Hawai", category: "pizza", prepTime: 300, aliases: ["Hawaii", "Havaj", "Havai", "Havaji"] },
    { id: 8, name: "Roma", category: "pizza", prepTime: 300 },
    { id: 9, name: "Trentino", category: "pizza", prepTime: 300 },
    { id: 10, name: "Spinaci", category: "pizza", prepTime: 300 },
    { id: 11, name: "Vegeteriana", category: "pizza", prepTime: 300 },
    { id: 12, name: "Mista", category: "pizza", prepTime: 300 },
    { id: 13, name: "Capricciosa", category: "pizza", prepTime: 300 },
    { id: 14, name: "Monda", category: "pizza", prepTime: 300 },
    { id: 15, name: "Vasco", category: "pizza", prepTime: 300 },
    { id: 16, name: "Diavola", category: "pizza", prepTime: 300 },
    { id: 17, name: "Parma", category: "pizza", prepTime: 300 },
    { id: 18, name: "Pollo", category: "pizza", prepTime: 300 },
    { id: 19, name: "Frida", category: "pizza", prepTime: 300 },
    { id: 20, name: "Messicana", category: "pizza", prepTime: 300 },
    { id: 21, name: "Picante", category: "pizza", prepTime: 300 },
    // Grill items
    { id: 101, name: "Grilované kuře", category: "grill", prepTime: 1200, aliases: ["kuře", "půlka", "čtvrtka", "grilka", "kure"] },
    { id: 102, name: "Mix gril", category: "grill", prepTime: 900, aliases: ["mix", "talíř", "gril mix", "masový mix", "talir"] },
    { id: 103, name: "Grilovaná žebra", category: "grill", prepTime: 1500, aliases: ["žebra", "žebírka", "vepřová žebra", "zebra", "zebirka"] },
    { id: 104, name: "Grilované koleno", category: "grill", prepTime: 1800, aliases: ["koleno", "vepřové koleno", "zadní koleno", "veprove koleno"] },
    { id: 105, name: "Burger menu", category: "grill", prepTime: 600, aliases: ["burger", "hambáč", "bulka", "cheeseburger", "hambac"] },
    { id: 106, name: "Grilovaný hermelín", category: "grill", prepTime: 600, aliases: ["hermelín", "sýr na grilu", "hermos", "hermelin"] }
];

const CZECH_NUMBER_MAP = {
    "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10,
    "jedna": 1, "jednu": 1, "jeden": 1, "jedny": 1,
    "dva": 2, "dvě": 2, "dvakrát": 2,
    "tři": 3, "třikrát": 3,
    "čtyři": 4, "čtyřikrát": 4,
    "pět": 5, "pětkrát": 5,
    "šest": 6, "sedm": 7, "osm": 8, "devět": 9, "deset": 10
};

const ADDRESS_KEYWORDS = ["ulice", "na adrese", "ulici", "město", "číslo", "adresa", "na adresu"];

const PIZZA_SYNONYMS = ["pizza", "piza", "pica", "pizzu", "pizu", "picu"];
const GRILL_SYNONYMS = ["grill", "gril", "grilovany", "grilovane", "grilovaneho", "grilovanou", "na grilu", "z grilu", "rost"];

const PHONE_KEYWORDS = ["telefon", "mobil", "číslo", "cislo", "tel", "kontakt"];

/**
 * Parses voice-to-text input into structured order data.
 * 2026 Refactor: Uses more robust regex and improved normalization.
 */
export const parseVoiceText = (text, userDictionary = [], customMenu = []) => {
    if (!text) return null;
    
    const normalizeInternal = (t) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

    // Use Intl.Segmenter (modern standard) for better word tokenization in Czech if needed, 
    // but for now, we'll stick to robust normalization.
    let cleaned = normalizeInternal(text);
    let originalCleaned = cleaned; // Keep copy for category check later

    let phone = "";
    let address = "";
    let identifiedItems = [];
    let maxPrepTime = 0;

    // Combine static menu with custom menu items
    const fullMenu = [...PIZZA_MENU, ...customMenu];

    // Step 0: Phonetic Normalization for categories
    // This allows the item matcher to work even if the user says "pica" or "grill"
    let normalizedForItems = cleaned
        .replace(new RegExp(`\\b(${PIZZA_SYNONYMS.join('|')})\\b`, 'g'), 'pizza')
        .replace(new RegExp(`\\b(${GRILL_SYNONYMS.join('|')})\\b`, 'g'), 'grill');
    
    // 1. Extract Phone Number with keyword support and flexible separators
    const phoneKeywordsPattern = PHONE_KEYWORDS.join('|');
    const phoneRegex = new RegExp(`(?:(?:${phoneKeywordsPattern})[:\\s]*)?(?:\\+?420|00420)?\\s?([1-9]\\d{2})[\\s\\-]*(\\d{3})[\\s\\-]*(\\d{3})`, 'i');
    const phoneMatch = cleaned.match(phoneRegex);
    if (phoneMatch) {
        phone = `+420${phoneMatch[1]}${phoneMatch[2]}${phoneMatch[3]}`;
        // Remove phone from cleaned text to avoid interfering with other parsing
        cleaned = cleaned.replace(phoneMatch[0], '').trim();
    }
    
    // 2. Extract Address (basic attempt)
    const addressKeywordPattern = ADDRESS_KEYWORDS.join('|');
    const addressRegex = new RegExp(`(?:${addressKeywordPattern})\\s+([^,.]+?)(?=\\s+(?:pizza|grill|id:)|$)`, 'i');
    const addressMatch = cleaned.match(addressRegex);
    
    if (addressMatch) {
        let potentialAddress = addressMatch[1];
        
        // Heuristic: Remove any trailing menu item names that might have been caught
        for (const item of fullMenu) {
            const itemName = item.name.toLowerCase();
            if (potentialAddress.endsWith(itemName)) {
                potentialAddress = potentialAddress.substring(0, potentialAddress.length - itemName.length).trim();
            }
        }

        address = potentialAddress.replace(/[,.]$/, '').trim();
        // Clean up the text for subsequent item parsing
        cleaned = cleaned.replace(addressMatch[0], '').trim();
    }
    
    // 3. Identify Items and Quantities
    // First, check user dictionary for nicknames
    userDictionary.forEach(entry => {
        const nickname = entry.nickname.toLowerCase();
        if (normalizedForItems.includes(nickname)) {
            identifiedItems.push({ name: entry.pizzaName, quantity: 1, category: "pizza" });
            normalizedForItems = normalizedForItems.replace(nickname, '').trim();
        }
    });

    // Then, check fullMenu with quantities
    const numPattern = `\\b(?:\\d+|${Object.keys(CZECH_NUMBER_MAP).join('|')})\\b`;
    const consolidatedItems = {};
    for (const item of fullMenu) {
        const names = [item.name, ...(item.aliases || [])].map(n => normalizeInternal(Array.isArray(n) ? n[0] : n));
        for (const pName of names) {
            // Regex hledá množství PŘED (match[1]) nebo ZA (match[2]) názvem položky
            const regex = new RegExp(`(?:(${numPattern})\\s+)?${pName}(?:\\s+(${numPattern}))?`, 'g');
            let match;
            while ((match = regex.exec(normalizedForItems)) !== null) {
                const qtyWord = match[1] || match[2];
                const quantity = qtyWord ? (CZECH_NUMBER_MAP[qtyWord] || parseInt(qtyWord) || 1) : 1;
                
                consolidatedItems[item.name] = (consolidatedItems[item.name] || 0) + quantity;
                identifiedItems.push({ name: item.name, category: item.category });
                
                if (item.prepTime > maxPrepTime) maxPrepTime = item.prepTime;
            }
        }
    }

    const itemSummary = Object.entries(consolidatedItems)
        .map(([name, qty]) => `${qty}x ${name}`)
        .join(", ");

    // Determine primary category based on identified items OR keywords
    const normalizedGrillKeywords = GRILL_SYNONYMS.map(w => normalizeInternal(w));
    const hasGrillKeyword = normalizedGrillKeywords.some(word => originalCleaned.includes(word));
    const hasGrillItem = identifiedItems.some(i => i.category === 'grill');
    
    const category = (hasGrillKeyword || hasGrillItem) ? 'grill' : 'pizza';

    return {
        item: itemSummary || "Nerozpoznaná položka",
        address: address || "Doplnit ručně",
        phone: phone || "Doplnit ručně",
        category: category,
        prepTime: maxPrepTime || (category === 'pizza' ? 300 : 420)
    };
};

/**
 * Offloads voice text parsing to a Web Worker to keep the UI thread responsive.
 * 2026 Best Practice: Task-based worker offloading for heavy logic.
 * @param {string} text 
 * @param {Array} userDictionary 
 * @param {Array} customMenu
 * @returns {Promise<Object>}
 */
export const parseVoiceTextAsync = (text, userDictionary = [], customMenu = []) => {
    return new Promise((resolve, reject) => {
        // Using 'module' type allows the worker to use standard ES imports
        const worker = new Worker(new URL('./parser-worker.js', import.meta.url), {
            type: 'module'
        });

        worker.onmessage = (event) => {
            const { success, result, error } = event.data;
            if (success) {
                resolve(result);
            } else {
                reject(new Error(error));
            }
            worker.terminate();
        };

        worker.onerror = (err) => {
            reject(err);
            worker.terminate();
        };

        // Vue 3 Proxies cannot be cloned by postMessage. 
        // We convert to plain objects to ensure compatibility with the Worker.
        worker.postMessage({ 
            text, 
            userDictionary: JSON.parse(JSON.stringify(userDictionary)), 
            customMenu: JSON.parse(JSON.stringify(customMenu)) 
        });
    });
};