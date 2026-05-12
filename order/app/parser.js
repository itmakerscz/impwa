/**
 * Pizza Menu Data extracted from the application's food list.
 */
const PIZZA_MENU = [
    { id: 1, name: "Margherita" },
    { id: 2, name: "Šunková" },
    { id: 3, name: "Slaninová" },
    { id: 4, name: "Quatro" },
    { id: 5, name: "Salamová" },
    { id: 6, name: "Fungi" },
    { id: 7, name: "Hawai" },
    { id: 8, name: "Roma" },
    { id: 9, name: "Trentino" },
    { id: 10, name: "Spinaci" },
    { id: 11, name: "Vegeteriana" },
    { id: 12, name: "Mista" },
    { id: 13, name: "Capricciosa" },
    { id: 14, name: "Monda" },
    { id: 15, name: "Vasco" },
    { id: 16, name: "Diavola" },
    { id: 17, name: "Parma" },
    { id: 18, name: "Pollo" },
    { id: 19, name: "Frida" },
    { id: 20, name: "Messicana" },
    { id: 21, name: "Picante" },
    { id: 22, name: "Sýrová se šunkou a brusinkami" },
    { id: 23, name: "Farmářská" },
    { id: 24, name: "Lucifer" },
    { id: 25, name: "Indie" },
    { id: 26, name: "Romda" },
    { id: 27, name: "Stripska" },
    { id: 28, name: "St.Patrick's Day pizza" }
];

/**
 * Calculates the Levenshtein distance between two strings to identify typos.
 */
const getLevenshteinDistance = (a, b) => {
    const matrix = Array.from({ length: a.length + 1 }, () => []);
    for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
    for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }
    return matrix[a.length][b.length];
};

/**
 * Returns a similarity score between 0 and 1.
 */
const getSimilarity = (s1, s2) => {
    const maxLength = Math.max(s1.length, s2.length);
    return maxLength === 0 ? 1.0 : (maxLength - getLevenshteinDistance(s1, s2)) / maxLength;
};

/**
 * Scans the transcript using a sliding window to find the best fuzzy match for menu items.
 */
const findFuzzyMatch = (transcript, menu) => {
    const FUZZY_THRESHOLD = 0.75;
    const words = transcript.replace(/[.,!?;:]/g, "").split(/\s+/);
    let best = { item: null, score: 0 };

    for (const pizza of menu) {
        const target = pizza.name.toLowerCase();
        const targetLen = target.split(/\s+/).length;
        
        // Scan transcript for segments of similar word length to the target menu item
        for (let len = Math.max(1, targetLen - 1); len <= targetLen + 1; len++) {
            for (let i = 0; i <= words.length - len; i++) {
                const candidate = words.slice(i, i + len).join(" ");
                const score = getSimilarity(candidate, target);
                if (score > best.score) best = { item: pizza.name, score };
            }
        }
    }
    return best.score >= FUZZY_THRESHOLD ? best.item : null;
};

const ADDRESS_KEYWORDS = ["na adresu", "adresa", "v ulici", "ulice", "ulici", "na", "do", "v", "čp", "bydlím"];

/**
 * Linguistic noise to remove before entity extraction
 */
const CZECH_STOP_WORDS = [
    "prosím", "děkuji", "díky", "chtěl", "bych", "si", "dát", "jednu", "nějakou", "pizzu", "pizzy", "objednat"
];

const CZECH_NUMBER_MAP = {
    "jedna": 1, "jednu": 1, "jeden": 1,
    "dva": 2, "dvě": 2,
    "tři": 3,
    "čtyři": 4,
    "pět": 5,
    "šest": 6,
    "sedm": 7,
    "osm": 8,
    "devět": 9,
    "deset": 10
};

const CZECH_ORDINAL_MAP = {
    "první": 1,
    "druhá": 2, "druhou": 2, "druhý": 2,
    "třetí": 3,
    "čtvrtá": 4, "čtvrtou": 4,
    "pátá": 5, "pátou": 5,
    "šestá": 6, "šestou": 6,
    "sedmá": 7, "sedmou": 7,
    "osmá": 8, "osmou": 8,
    "devátá": 9, "devátou": 9,
    "desátá": 10, "desátou": 10
};

/**
 * Extracts structured order information from natural language transcript.
 */
export const extractOrderData = (text) => {
    const transcript = text.toLowerCase().trim();
    if (!transcript) return null;

    // 0. Pre-processing: Remove linguistic noise
    let normalizedText = transcript;
    CZECH_STOP_WORDS.forEach(word => {
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        normalizedText = normalizedText.replace(regex, '');
    });
    normalizedText = normalizedText.replace(/\s+/g, ' ').trim();

    let cleanedTranscript = normalizedText;

    // 1. Extract Phone Number (Czech format: +420 777 123 456, 00420..., 777123456)
    let phone = "Neuvedeno";
    const phoneRegex = /(?:(?:(?:\+|00)420)\s*)?([2-9]\d{2}(?:\s*\d{3}){2})/g;
    const phoneMatch = phoneRegex.exec(transcript);
    if (phoneMatch) {
        phone = phoneMatch[1].replace(/\s/g, "");
        cleanedTranscript = cleanedTranscript.replace(phoneMatch[0], "");
    }

    // 2. Extract Delivery Time
    let deliveryTime = "Co nejdříve";
    const hourWords = "jedna|jednu|jeden|dva|dvě|tři|čtyři|pět|šest|sedm|osm|devět|deset|jedenáct|dvanáct|třináct|čtrnáct|patnáct|šestnáct|sedmnáct|osmnáct|devatenáct|dvacet|jednadvacet|dvacet dva|dvacet tři|dvacet čtyři";
    
    const timePatterns = [
        // Format: 18:30 or 18.30
        { regex: /(\d{1,2})[:.](\d{2})/, label: (m) => m[0] },
        // Format: v šest hodin, v 6 hodin
        { regex: new RegExp(`\\bv\\s+(${hourWords}|\\d{1,2})\\s*(?:hodin|hodiny|hodinu)?\\b`, "i"), label: (m) => m[0] },
        // Format: co nejdříve, hned
        { regex: /\b(co\s+nejdříve|asap|hned)\b/i, label: () => "Co nejdříve" }
    ];

    for (const pattern of timePatterns) {
        const match = cleanedTranscript.match(pattern.regex);
        if (match) {
            deliveryTime = pattern.label(match);
            // Remove the time phrase from transcript to avoid interference with address/items
            cleanedTranscript = cleanedTranscript.replace(match[0], "");
            break;
        }
    }

    // 3. Extract Address (Heuristic for Czech context)
    let address = "Osobní odběr / Neuvedeno";
    for (const keyword of ADDRESS_KEYWORDS) {
        const regex = new RegExp(`\\b${keyword}\\b\\s+(.+)`, "i");
        const match = cleanedTranscript.match(regex);
        if (match) {
            const potential = match[1].split(/prosím|dík|ahoj|díky|tečka|pak|chci|dej/i)[0].trim();
            if (potential.length > 3) {
                address = potential;
                // Remove keyword and extracted address from the transcript
                cleanedTranscript = cleanedTranscript.replace(new RegExp(`\\b${keyword}\\b\\s+${potential.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i'), "");
                break;
            }
        }
    }

    // 4. Multi-item Extraction
    // Mask ' a ' in specific pizza names to prevent incorrect splitting (e.g. Sýrová se šunkou a brusinkami)
    const MASK = "___AND___";
    let processingText = cleanedTranscript;
    PIZZA_MENU.forEach(p => {
        if (p.name.toLowerCase().includes(" a ")) {
            const masked = p.name.toLowerCase().replace(/\s+a\s+/g, ` ${MASK} `);
            processingText = processingText.replace(new RegExp(p.name.toLowerCase(), 'g'), masked);
        }
    });

    const chunks = processingText.split(/,\s*|\s+a\s+|\s+pak\s+|\s+další\s+|\s+i\s+/);
    const identifiedItems = [];
    const sortedMenu = [...PIZZA_MENU].sort((a, b) => b.name.length - a.name.length);

    for (let chunk of chunks) {
        chunk = chunk.replace(new RegExp(MASK, 'g'), "a").trim();
        if (!chunk) continue;

        let pizzaName = null;
        let quantity = 1;

        // Extract quantity if present (e.g., "2x", "dvě", "3 ") - Supports digits and Czech words
        const numberWords = Object.keys(CZECH_NUMBER_MAP).join('|');
        const qtyRegexStart = new RegExp(`^(\\d+|${numberWords})\\s*(?:x|krát|ks|kusy|kusů)?`, "i");
        const qtyRegexEnd = new RegExp(`(\\d+|${numberWords})\\s*(?:x|krát|ks|kusy|kusů)$`, "i");

        const qtyMatch = chunk.match(qtyRegexStart) || chunk.match(qtyRegexEnd);
        if (qtyMatch) {
            const matchedVal = qtyMatch[1].toLowerCase();
            quantity = CZECH_NUMBER_MAP[matchedVal] || parseInt(matchedVal);
            chunk = chunk.replace(qtyMatch[0], "").trim();
        }

        // A. Exact Name Match
        for (const pizza of sortedMenu) {
            if (chunk.includes(pizza.name.toLowerCase())) {
                pizzaName = pizza.name;
                break;
            }
        }

        // B. Number Match (ID) or Ordinal Match
        if (!pizzaName) {
            const numMatch = chunk.match(/(?:číslo|pizzu)\s*(\d+)/) || chunk.match(/\b(\d+)\b/);
            const ordinalWords = Object.keys(CZECH_ORDINAL_MAP).join('|');
            const ordMatch = chunk.match(new RegExp(`\\b(${ordinalWords})\\b`, "i"));

            if (numMatch) {
                const id = parseInt(numMatch[1]);
                const p = PIZZA_MENU.find(x => x.id === id);
                if (p) pizzaName = p.name;
            } else if (ordMatch) {
                const id = CZECH_ORDINAL_MAP[ordMatch[1].toLowerCase()];
                const p = PIZZA_MENU.find(x => x.id === id);
                if (p) pizzaName = p.name;
            }
        }

        // C. Fuzzy Match
        if (!pizzaName) {
            pizzaName = findFuzzyMatch(chunk, PIZZA_MENU);
        }

        if (pizzaName) {
            identifiedItems.push({ name: pizzaName, quantity });
        }
    }

    if (identifiedItems.length === 0) { // If no items identified, return an empty order structure
        return {
            item: "", // Empty summary string
            items: [], // Empty items array
            quantity: 0,
            address,
            phone,
            deliveryTime,
            toppings: [],
            rawText: text,
            created_at: new Date().toISOString()
        };
    }

    // Create a summary string and total quantity for the UI
    const itemSummary = identifiedItems
        .map(i => `${i.quantity > 1 ? i.quantity + 'x ' : ''}${i.name}`)
        .join(", ");
    
    const totalQuantity = identifiedItems.reduce((sum, i) => sum + i.quantity, 0);

    return {
        item: itemSummary,
        items: identifiedItems,
        quantity: totalQuantity,
        address,
        phone,
        deliveryTime,
        toppings: [],
        rawText: text,
        created_at: new Date().toISOString()
    };
};