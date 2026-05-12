export const extractOrderData = (text) => {
    const raw = text.toLowerCase();
    
    // Pattern extraction
    const phone = raw.replace(/\s/g, '').match(/\d{9}/)?.[0] || "Chybí telefon";
    const quantity = raw.match(/(\d+)\s*(?:x|krát|pizz)/)?.[1] || "1";
    
    // Extract pizza type (looks between 'pizzu/pizza' and prepositions)
    const itemMatch = raw.match(/(?:pizzu|pizza|pizzy)\s+([a-zěščřžýáíéóúů\s]+?)(?=\sna|v\s|ulici|adresa|$)/i);
    const item = itemMatch ? itemMatch[1].trim() : "Margarita";

    // Extract address after prepositions
    const addressMatch = raw.match(/(?:na adresu|ulici|v|do)\s+(.*)/i);
    const address = addressMatch ? addressMatch[1].replace(phone, '').trim() : "Osobní odběr";

    return { item: `Pizza ${item}`, quantity, address, phone, toppings: [] };
};
