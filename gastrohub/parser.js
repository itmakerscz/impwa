// parser.js
import { formatQty } from './utils.js';
export const PIZZA_MENU = [
    { id: 1, name: "Margherita", category: "pizza", prepTime: 300, price: 159 },
    { id: 2, name: "Šunková", category: "pizza", prepTime: 300, price: 179 },
    { id: 3, name: "Slaninová", category: "pizza", prepTime: 300, price: 189 },
    { id: 4, name: "Quatro", category: "pizza", prepTime: 300, price: 199 },
    { id: 5, name: "Salamová", category: "pizza", prepTime: 300, price: 189 },
    { id: 6, name: "Fungi", category: "pizza", prepTime: 300, price: 179 },
    { id: 7, name: "Hawai", category: "pizza", prepTime: 300, price: 189, aliases: ["Hawaii", "Havaj", "Havai", "Havaji"] },
    { id: 8, name: "Roma", category: "pizza", prepTime: 300, price: 185 },
    { id: 9, name: "Trentino", category: "pizza", prepTime: 300, price: 189 },
    { id: 10, name: "Spinaci", category: "pizza", prepTime: 300, price: 179 },
    { id: 11, name: "Vegeteriana", category: "pizza", prepTime: 300, price: 189 },
    { id: 12, name: "Mista", category: "pizza", prepTime: 300, price: 195 },
    { id: 13, name: "Capricciosa", category: "pizza", prepTime: 300, price: 189 },
    { id: 14, name: "Monda", category: "pizza", prepTime: 300, price: 199 },
    { id: 15, name: "Vasco", category: "pizza", prepTime: 300, price: 205 },
    { id: 16, name: "Diavola", category: "pizza", prepTime: 300, price: 195 },
    { id: 17, name: "Parma", category: "pizza", prepTime: 300, price: 215 },
    { id: 18, name: "Pollo", category: "pizza", prepTime: 300, price: 195 },
    { id: 19, name: "Frida", category: "pizza", prepTime: 300, price: 189 },
    { id: 20, name: "Messicana", category: "pizza", prepTime: 300, price: 199 },
    { id: 21, name: "Picante", category: "pizza", prepTime: 300, price: 199 },
    // Grill items
    { id: 101, name: "Grilované kuře", category: "grill", prepTime: 1200, price: 249, aliases: ["kuře", "půlka", "čtvrtka", "grilka", "kure"] },
    { id: 102, name: "Mix gril", category: "grill", prepTime: 900, price: 329, aliases: ["mix", "talíř", "gril mix", "masový mix", "talir"] },
    { id: 103, name: "Grilovaná žebra", category: "grill", prepTime: 1500, price: 289, aliases: ["žebra", "žebírka", "vepřová žebra", "zebra", "zebirka"] },
    { id: 104, name: "Grilované koleno", category: "grill", prepTime: 1800, price: 349, aliases: ["koleno", "vepřové koleno", "zadní koleno", "veprove koleno"] },
    { id: 105, name: "Burger menu", category: "grill", prepTime: 600, price: 219, aliases: ["burger", "hambáč", "bulka", "cheeseburger", "hambac"] },
    { id: 106, name: "Grilovaný hermelín", category: "grill", prepTime: 600, price: 169, aliases: ["hermelín", "sýr na grilu", "hermos", "hermelin"] }
];

const CZECH_NUMBER_MAP = {
    "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10,
    "jedna": 1, "jednu": 1, "jeden": 1, "jedny": 1, "jedno": 1,
    "dva": 2, "dve": 2, "dvakrat": 2,
    "tri": 3, "trikrat": 3,
    "ctyri": 4, "ctyrikrat": 4,
    "pet": 5, "petkrat": 5, "pět": 5, "pětkrát": 5,
    "sest": 6, "sestkrat": 6, "šest": 6, "šestkrát": 6,
    "sedm": 7, "sedmkrat": 7,
    "osm": 8, "osmkrat": 8,
    "devet": 9, "devetkrat": 9, "devět": 9, "devětkrát": 9,
    "deset": 10, "desetkrat": 10,
    // Additional forms
    "jednou": 1, "dvakrát": 2, "třikrát": 3, "čtyřikrát": 4, "pětkrát": 5,
    "šestkrát": 6, "sedmkrát": 7, "osmkrát": 8, "devětkrát": 9, 
    // Fractional support
    "pul": 0.5, "pulka": 0.5, "pulku": 0.5,
    "ctvrt": 0.25, "ctvrtka": 0.25, "ctvrtku": 0.25
};

const ADDRESS_KEYWORDS = ["ulice", "na adrese", "ulici", "město", "číslo", "adresa", "na adresu"];

const PIZZA_SYNONYMS = ["pizza", "piza", "pica", "pizzu", "pizu", "picu"];
const GRILL_SYNONYMS = ["grill", "gril", "grilovany", "grilovane", "grilovaneho", "grilovanou", "na grilu", "z grilu", "rost"];

const PHONE_KEYWORDS = ["telefon", "mobil", "číslo", "cislo", "tel", "kontakt"];

/**
 * Normalization map for ingredients in modifiers (extras).
 * Maps various forms and synonyms to a standardized term.
 */
const INGREDIENT_SYNONYMS = {
    "eidam": "syr",
    "syra": "syr",
    "syru": "syr",
    "mozzarella": "syr",
    "niva": "syr",
    "hermelin": "syr",
    "cibuli": "cibule",
    "slaninu": "slanina",
    "sunku": "sunka",
    "vajicko": "vejce",
    "rajce": "rajcata"
};

/**
 * Price list for ingredients when added as "extra".
 */
const INGREDIENT_PRICES = {
    "syr": 20,
    "cibule": 10,
    "slanina": 25,
    "sunka": 20,
    "vejce": 15,
    "rajcata": 15
};

/**
 * Klíčová slova pro detekci prioritních objednávek (Rush).
 */
const RUSH_KEYWORDS = ["spech", "spesne", "urgentni", "rychle", "rychly", "hned", "priorita"];

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
    let identifiedItemsList = [];
    let maxPrepTime = 0;
    let totalPrice = 0;

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
            normalizedForItems = normalizedForItems.replace(nickname, '').trim();
        }
    });

    // Then, check fullMenu with quantities
    const sortedNumKeys = Object.keys(CZECH_NUMBER_MAP).sort((a, b) => b.length - a.length);
    const numPattern = `\\b(?:\\d+|${sortedNumKeys.join('|')})\\b`;
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

                // Detect modifiers (extra/bez) in the snippet immediately following the item name
                const lookAhead = normalizedForItems.substring(match.index + match[0].length, match.index + match[0].length + 60);
                const modMatches = [...lookAhead.matchAll(/\b(extra|navic|plus|s|bez|minus|ne)\s+([a-z]+)\b/gi)];
                
                let extrasPrice = 0;
                const extras = modMatches.map(m => {
                    const action = m[1].toLowerCase();
                    const ingredient = INGREDIENT_SYNONYMS[m[2]] || m[2];
                    if (["extra", "navic", "plus", "s"].includes(action)) {
                        extrasPrice += (INGREDIENT_PRICES[ingredient] || 0);
                    }
                    return `${m[1]} ${ingredient}`;
                }).join(", ");
                
                // Detect rush keyword
                const isRush = RUSH_KEYWORDS.some(keyword => lookAhead.includes(keyword));

                consolidatedItems[item.name] = (consolidatedItems[item.name] || 0) + quantity;
                identifiedItemsList.push({ 
                    name: item.name, 
                    category: item.category, 
                    price: item.price, 
                    extrasPrice: extrasPrice,
                    prepTime: item.prepTime,
                    quantity: quantity,
                    extras: extras,
                    isRush: isRush // Add the rush flag here
                });
                totalPrice += ((item.price || 0) + extrasPrice) * quantity;
                
                if (item.prepTime > maxPrepTime) maxPrepTime = item.prepTime;
            }
        }
    }

    const itemSummary = Object.entries(consolidatedItems)
        .map(([name, qty]) => `${formatQty(qty)}x ${name}`)
        .join(", ");

    // Determine primary category based on identified items OR keywords
    const normalizedGrillKeywords = GRILL_SYNONYMS.map(w => normalizeInternal(w));
    const hasGrillKeyword = normalizedGrillKeywords.some(word => originalCleaned.includes(word));
    const hasGrillItem = identifiedItemsList.some(i => i.category === 'grill');
    
    const category = (hasGrillKeyword || hasGrillItem) ? 'grill' : 'pizza';

    return {
        item: itemSummary || "Nerozpoznaná položka",
        items: identifiedItemsList,
        address: address || "Doplnit ručně",
        phone: phone || "Doplnit ručně",
        category: category,
        prepTime: maxPrepTime || (category === 'pizza' ? 300 : 420),
        price: totalPrice
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