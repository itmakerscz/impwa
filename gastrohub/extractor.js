// extractor.js
export const Extractor = {
    /**
     * Normalizes scanned numerical phone string inputs into standard Czech international formats
     * @param {string} str - Raw digits extracted by regex match pairs
     */
    normalizePhone(str) {
        if (!str) return '';
        // Sanitize typical OCR character substitutions (e.g., 'S' -> '6', 'O'/'o' -> '0')
        let cleaned = str.replace(/S/g, '6').replace(/[Oo]/g, '0').replace(/\D/g, '');
        
        if (cleaned.length === 9) {
            cleaned = '420' + cleaned;
        }
        
        return (cleaned.length === 12 && cleaned.startsWith('420')) ? `+${cleaned}` : '';
    },

    /**
     * Filters raw string pools down to relevant comments and parses targeting delivery info
     * @param {string} text - Raw unformatted OCR output block from Tesseract.js
     */
    extract(text) {
        // Immediately isolate lines intentionally prepended with text markers
        const relevantLines = text.split('\n')
            .map(l => l.trim())
            .filter(l => l.startsWith('//'));

        let res = { phone: '', address: '', price: '' };

        relevantLines.forEach((line) => {
            // 1. Extract Phone: Targets patterns matching standard 9-digit groups with keywords and prefixes (+420, 00420)
            const phMatch = line.match(/(?:(?:telefon|mobil|číslo|cislo|tel|kontakt)[\s:]*)?(?:\+?420|00420)?\s?([\dSB]{3})[\s\-]*([\dSB]{3})[\s\-]*([\dSB]{3})/i);
            if (!res.phone && phMatch) {
                res.phone = this.normalizePhone(phMatch[1] + phMatch[2] + phMatch[3]);
            }

            // 2. Extract Address: Matches standard format pattern: // Street Name 123, City
            const addrMatch = line.match(/^\/\/\s*([a-zA-Zá-žÁ-Ž\s]+\s\d+),\s*([a-zA-Zá-žÁ-Ž\s]+)/);
            if (!res.address && addrMatch) {
                res.address = `${addrMatch[1]}, ${addrMatch[2]}`;
            }

            // 3. Extract Price: Captures digit groups trailing ahead of common currencies (Kč, KC, Kc)
            const priceMatch = line.match(/(\d+[\s\d]*)\s*(?:Kč|KC|Kc)/i);
            if (!res.price && priceMatch) {
                res.price = priceMatch[1].replace(/\s/g, '') + ' Kč';
            }
        });

        return res;
    }
};