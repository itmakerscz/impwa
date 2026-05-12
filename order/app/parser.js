export const extractOrderData = (text) => {
    const raw = text.toLowerCase();
    const phone = raw.replace(/\s/g, '').match(/\d{9,}/)?.[0] || "Chybí telefon";

    // Enhanced quantity (supports words)
    const qtyWords = { 'jednu': 1, 'jedna': 1, 'dvě': 2, 'tři': 3, 'čtyři': 4, 'pět': 5 };
    let quantity = raw.match(/(\d+)\s*(?:x|krát|pizz)/)?.[1];
    if (!quantity) {
        for (const [word, val] of Object.entries(qtyWords)) {
            if (raw.includes(word)) {
                quantity = val.toString();
                break;
            }
        }
    }
    quantity = quantity || "1";

    // Improved item extraction (less greedy lookahead)
    const itemMatch = raw.match(/(?:pizzu|pizza|pizzy)\s+([a-zěščřžýáíéóúů\s]+?)(?=\sna|v\s|u\s|do|ulici|adresa|telefon|číslo|$)/i);
    const itemRaw = itemMatch ? itemMatch[1].trim() : "margarita";
    const item = itemRaw.charAt(0).toUpperCase() + itemRaw.slice(1);

    // Better address boundary detection (stops before phone or pizza keywords)
    const addressMatch = raw.match(/(?:na adresu|ulici|v\s|do\s)\s*(.+?)(?=\s(?:pizz|telefon|číslo|kontakt|mobil|je to|$))/i);
    const address = addressMatch ? addressMatch[1].replace(phone, '').trim() : "Osobní odběr";

    return { item: `Pizza ${item}`, quantity, address: address || "Osobní odběr", phone, toppings: [] };
};
