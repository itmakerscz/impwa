/**
 * Pizza Menu Data extracted from the application's food list.
 */
export const PIZZA_MENU = [
    { id: 1, name: "Margherita" },
    { id: 2, name: "Šunková" },
    { id: 3, name: "Slaninová" },
    { id: 4, name: "Quatro" },
    { id: 5, name: "Salamová" },
    { id: 6, name: "Fungi" },
    { id: 7, name: "Hawai", aliases: ["Hawaii", "Havaj", "Havai", "Havaji"] },
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
 * Normalizes Czech text by removing diacritics and handling common phonetic overlaps.
 */
const foldCzech = (text) => {
    return text.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, "") // Remove diacritics
        .replace(/w/g, 'v')             // Phonetic overlap
        .trim();
};

/**
 * Pre-normalized menu data for performance.
 */
const getCharHistogram = (str) => {
    const hist = new Int16Array(26);
    for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i) - 97; // 'a' is 97
        if (code >= 0 && code < 26) hist[code]++;
    }
    return hist;
};

const NORMALIZED_MENU = PIZZA_MENU.map(pizza => {
    const foldedName = foldCzech(pizza.name);
    const foldedAliases = (pizza.aliases || []).map(a => foldCzech(a));
    return {
        ...pizza,
        foldedName,
        foldedAliases,
        fuzzyTargets: [
            { text: foldedName, original: pizza.name },
            ...foldedAliases.map(a => ({ text: a, original: pizza.name }))
        ].map(t => ({
            ...t,
            wordLen: t.text.split(/\s+/).length,
            strLen: t.text.length,
            hist: getCharHistogram(t.text)
        })),
        hasAnd: foldedName.includes(" a "),
        maskedName: foldedName.replace(/\s+a\s+/g, " ___AND___ ")
    };
}).sort((a, b) => b.name.length - a.name.length);

/**
 * Normalizes user dictionary entries for high-performance matching.
 */
export const normalizeDictionary = (dictionary) => {
    return (dictionary || []).map(entry => {
        const foldedNickname = foldCzech(entry.nickname);
        return {
            ...entry,
            foldedNickname,
            fuzzyTargets: [{
                text: foldedNickname,
                original: entry.pizzaName,
                wordLen: foldedNickname.split(/\s+/).length,
                strLen: foldedNickname.length,
                hist: getCharHistogram(foldedNickname)
            }]
        };
    });
};

/** Reusable buffers for Levenshtein to avoid GC pressure */
let levPrevRow = new Uint16Array(256);
let levCurrRow = new Uint16Array(256);

/**
 * Calculates the Levenshtein distance between two strings to identify typos.
 */
const getLevenshteinDistance = (a, b, threshold = Infinity) => {
    if (a.length < b.length) [a, b] = [b, a];
    const aLen = a.length;
    const bLen = b.length;
    if (bLen === 0) return aLen;
    if (aLen - bLen > threshold) return threshold + 1;

    if (bLen + 1 > levPrevRow.length) {
        levPrevRow = new Uint16Array(bLen + 64);
        levCurrRow = new Uint16Array(bLen + 64);
    }

    for (let j = 0; j <= bLen; j++) levPrevRow[j] = j;

    for (let i = 1; i <= aLen; i++) {
        levCurrRow[0] = i;
        let minRowDist = i;
        const charA = a[i - 1];
        for (let j = 1; j <= bLen; j++) {
            const cost = charA === b[j - 1] ? 0 : 1;
            levCurrRow[j] = Math.min(
                levCurrRow[j - 1] + 1,
                levPrevRow[j] + 1,
                levPrevRow[j - 1] + cost
            );
            if (levCurrRow[j] < minRowDist) minRowDist = levCurrRow[j];
        }

        if (minRowDist > threshold) return threshold + 1;

        const temp = levPrevRow;
        levPrevRow = levCurrRow;
        levCurrRow = temp;
    }
    return levPrevRow[bLen];
};

/**
 * Returns a similarity score between 0 and 1.
 */
const getSimilarity = (s1, s2, thresholdDist = Infinity) => {
    const maxLength = Math.max(s1.length, s2.length);
    if (maxLength === 0) return 1.0;
    const dist = getLevenshteinDistance(s1, s2, thresholdDist);
    return (maxLength - dist) / maxLength;
};

/**
 * Scans the transcript using a sliding window to find the best fuzzy match for menu items.
 */
const findFuzzyMatch = (transcript, menu, dictionary = []) => {
    const FUZZY_THRESHOLD = 0.75;
    const words = transcript.replace(/[.,!?;:]/g, "").split(/\s+/);
    const wordCount = words.length;
    let best = { item: null, score: 0 };
    
    // Combine menu targets and dictionary targets for a single search pass
    const allItems = [...menu, ...dictionary];

    for (const item of allItems) {
        for (const target of item.fuzzyTargets) {
            const targetText = target.text;
            const targetWordLen = target.wordLen;
            const targetStrLen = target.strLen;
            const targetHist = target.hist;

            for (let len = Math.max(1, targetWordLen - 1); len <= targetWordLen + 1; len++) {
                for (let i = 0; i <= wordCount - len; i++) {
                    const candidate = words.slice(i, i + len).join(" ");
                    const candStrLen = candidate.length;
                    const maxLen = Math.max(candStrLen, targetStrLen);
                    if (maxLen === 0) continue;

                    const currentThreshold = Math.max(best.score, FUZZY_THRESHOLD);
                    const maxAllowedDist = Math.floor(maxLen * (1 - currentThreshold));

                    // 1. Length-based pruning
                    if (Math.abs(candStrLen - targetStrLen) > maxAllowedDist) continue;

                    // 2. Letter-bag pruning (fast character count heuristic)
                    const candHist = getCharHistogram(candidate);
                    let diff = 0;
                    for (let k = 0; k < 26; k++) {
                        diff += Math.abs(candHist[k] - targetHist[k]);
                        if (diff > maxAllowedDist * 2) break;
                    }
                    if (diff > maxAllowedDist * 2) continue;

                    const score = getSimilarity(candidate, targetText, maxAllowedDist);
                    if (score > best.score) {
                        best = { item: target.original, score };
                    }
                }
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
const STOP_WORDS_REGEX = new RegExp(`\\b(${CZECH_STOP_WORDS.map(foldCzech).join('|')})\\b`, 'gi');

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
    "deset": 10,
    "jedenáct": 11,
    "dvanáct": 12,
    "třináct": 13,
    "čtrnáct": 14,
    "patnáct": 15,
    "šestnáct": 16,
    "sedmnáct": 17,
    "osmnáct": 18,
    "devatenáct": 19,
    "dvacet": 20,
    "dvacet jedna": 21, "dvacet jednu": 21, "dvacet jeden": 21,
    "dvacet dva": 22, "dvacet dvě": 22,
    "dvacet tři": 23,
    "dvacet čtyři": 24,
    "dvacet pět": 25,
    "dvacet šest": 26,
    "dvacet sedm": 27,
    "dvacet osm": 28,
    "dvacet devět": 29
};

/**
 * Extracts quantity from a text chunk.
 */
const parseQuantity = (chunk) => {
    // Sort words by length descending to ensure compound numbers (e.g., "dvacet jedna") 
    // are matched before single words (e.g., "dvacet")
    const sortedWords = Object.keys(CZECH_NUMBER_MAP).sort((a, b) => b.length - a.length);
    const numberWordsPattern = sortedWords.map(w => foldCzech(w)).join('|');
    
    const qtyRegex = new RegExp(`^(\\d+|${numberWordsPattern})\\s*(?:x|krát|ks|kusy|kusů|krát)?\\b`, "i");
    const match = chunk.match(qtyRegex);
    
    if (match) {
        const val = match[1].toLowerCase();
        // Find the numeric value by matching the folded (normalized) input against folded keys
        const originalKey = sortedWords.find(k => foldCzech(k) === val);
        const quantity = originalKey ? CZECH_NUMBER_MAP[originalKey] : parseInt(val, 10);
        const remaining = chunk.replace(match[0], "").trim();
        return { quantity, remaining };
    }
    return { quantity: 1, remaining: chunk };
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
 * Internal helper to extract phone numbers from text.
 */
const extractPhone = (transcript, normalizedText) => {
    const phoneRegex = /(?:telefon\s*)?(?:(?:(?:\+|00)420)\s*)?([2-9]\d{2}(?:\s*\d{3}\s*\d{3}|\s*\d{5}))/gi;
    const match = phoneRegex.exec(transcript);
    if (match) {
        return {
            phone: match[1].replace(/\s/g, ""),
            cleaned: normalizedText.replace(foldCzech(match[0]), "").trim()
        };
    }
    return { phone: "Neuvedeno", cleaned: normalizedText };
};

/**
 * Internal helper to extract delivery time based on patterns.
 */
const extractTime = (text) => {
    const hourWords = "jedna|jednu|jeden|dva|dvě|tři|čtyři|pět|šest|sedm|osm|devět|deset|jedenáct|dvanáct|třináct|čtrnáct|patnáct|šestnáct|sedmnáct|osmnáct|devatenáct|dvacet|jednadvacet|dvacet dva|dvacet tři|dvacet čtyři";
    const foldedHours = foldCzech(hourWords);
    const foldedTimeUnits = foldCzech("hodin|hodiny|hodinu|minut|minuty|minutu");
    const foldedRelativeKeywords = foldCzech("půl|čtvrt|tři čtvrtě");

    const patterns = [
        { regex: /(\d{1,2}):./, label: (m) => m[0] },
        { regex: new RegExp(`\\bv\\s+(${foldedHours}|\\d{1,2})\\s*(?:${foldedTimeUnits})?\\b`, "i"), label: (m) => m[0] },
        { 
            regex: new RegExp(`\\bza\\s+(?:(?:(\\d+|${foldedHours}|${foldedRelativeKeywords})\\s*(?:${foldedTimeUnits}))|hodinu|${foldCzech("hodinu a půl")}|${foldCzech("půl hodiny")})\\b`, "i"), 
            label: (m) => m[0] 
        },
        { regex: new RegExp(`\\b(${foldCzech("co nejdříve")}|asap|hned)\\b`, "i"), label: () => "Co nejdříve" }
    ];

    for (const p of patterns) {
        const match = text.match(p.regex);
        if (match) {
            return { deliveryTime: p.label(match), cleaned: text.replace(match[0], "").trim() };
        }
    }
    return { deliveryTime: "Co nejdříve", cleaned: text };
};

/**
 * Internal helper to extract address using Czech context heuristics.
 */
const extractAddressHeuristic = (text) => {
    for (const keyword of ADDRESS_KEYWORDS) {
        const regex = new RegExp(`\\b${keyword}\\b\\s+([a-z0-9\\s\\/\\.,-]+)`, "i");
        const match = text.match(regex);
        if (match) {
            let potential = match[1].split(/\b(prosím|dík|ahoj|díky|tečka|pak|chci|dej|a|i|dále|další|pizzu|pizzy|číslo)\b/i)[0].trim();
            const houseMatch = potential.match(/(.+\s+\d+[\/\w]*)\b/i);
            const finalAddress = houseMatch ? houseMatch[1].trim() : potential;

            if (finalAddress.length > 3) {
                const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const removeRegex = new RegExp(`\\b${keyword}\\b\\s+${escape(finalAddress)}`, 'i');
                return { address: finalAddress, cleaned: text.replace(removeRegex, "").trim() };
            }
        }
    }
    return { address: "Osobní odběr / Neuvedeno", cleaned: text };
};

/**
 * Extracts structured order information from natural language transcript.
 */
export const extractOrderData = (text, userDictionary = []) => {
    const transcript = text.toLowerCase().trim();
    if (!transcript) return null;

    let normalizedText = foldCzech(transcript).replace(STOP_WORDS_REGEX, '');
    normalizedText = normalizedText.replace(/\s+/g, ' ').trim();

    // 1. Entity Extraction Pipeline
    const phoneRes = extractPhone(transcript, normalizedText);
    const timeRes = extractTime(phoneRes.cleaned);
    const addrRes = extractAddressHeuristic(timeRes.cleaned);

    const phone = phoneRes.phone;
    const deliveryTime = timeRes.deliveryTime;
    const address = addrRes.address;
    const cleanedTranscript = addrRes.cleaned;

    // 4. Multi-item Extraction
    // Mask ' a ' in specific pizza names to prevent incorrect splitting (e.g. Sýrová se šunkou a brusinkami)
    const MASK = "___AND___";
    let processingText = cleanedTranscript;
    NORMALIZED_MENU.forEach(p => {
        if (p.hasAnd) {
            processingText = processingText.replace(new RegExp(p.foldedName, 'g'), p.maskedName);
        }
    });

    const chunks = processingText.split(/,\s*|\s+a\s+|\s+pak\s+|\s+další\s+|\s+i\s+/);
    const identifiedItems = [];

    for (let chunk of chunks) {
        chunk = chunk.replace(/___AND___/g, "a").trim();
        if (!chunk) continue;

        let pizzaName = null;
        let { quantity, remaining } = parseQuantity(chunk);
        chunk = remaining;

        // A. User Dictionary Match (Nicknames)
        const dictionaryMatch = userDictionary.find(d => d.foldedNickname === chunk || chunk.includes(d.foldedNickname));
        if (dictionaryMatch) {
            pizzaName = dictionaryMatch.pizzaName;
        }

        // B. Exact Name or Alias Match (Using normalized comparison)
        if (!pizzaName) {
        for (const pizza of NORMALIZED_MENU) {
            const matchesName = chunk.includes(pizza.foldedName);
            const matchesAlias = pizza.foldedAliases.some(alias => chunk.includes(alias));
            if (matchesName || matchesAlias) {
                pizzaName = pizza.name;
                break;
            }
        }
        }

        // C. Number Match (ID) or Ordinal Match
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

        // D. Fuzzy Match
        if (!pizzaName) {
            pizzaName = findFuzzyMatch(chunk, NORMALIZED_MENU, userDictionary);
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