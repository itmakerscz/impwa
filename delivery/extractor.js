// extractor.js
export const Extractor = {
    /**
     * Strictly enforces +420XXXXXXXXX format
     */
    normalizePhone(str) {
        if (!str) return '';
        
        // Fix OCR typos and remove everything except digits
        let cleaned = str.replace(/S/g, '6')
                         .replace(/[Oo]/g, '0')
                         .replace(/[ilL]/g, '1')
                         .replace(/B/g, '8')
                         .replace(/\D/g, '');

        // Convert 9-digit local to 12-digit international
        if (cleaned.length === 9) {
            cleaned = '420' + cleaned;
        } else if (cleaned.length > 12) {
            cleaned = cleaned.slice(-12);
        }

        // Return only if it's a valid 12-digit Czech number
        return (cleaned.length === 12 && cleaned.startsWith('420')) 
            ? `+${cleaned}` 
            : '';
    },

    extract(text) {
        // CRITICAL: Only process lines starting with //
        const lines = text.split('\n')
                          .map(l => l.trim())
                          .filter(l => l.startsWith('//'));

        let res = { phone: '', address: '', price: '' };

        lines.forEach((line) => {
            // 1. Phone Extraction (+420 format)
            const phMatch = line.match(/(?:\+?420)?\s?([\dSB]{3})[\s\-]*([\dSB]{3})[\s\-]*([\dSB]{3})/);
            if (!res.phone && phMatch) {
                const rawPhone = phMatch[1] + phMatch[2] + phMatch[3];
                res.phone = this.normalizePhone(rawPhone);
            }

            // 2. Address Extraction (Expected format: // Street 123, City)
            const addrMatch = line.match(/^\/\/\s*([a-zA-Zá-žÁ-Ž\s]+\s\d+),\s*([a-zA-Zá-žÁ-Ž\s]+)/);
            if (!res.address && addrMatch) {
                res.address = `${addrMatch[1]}, ${addrMatch[2]}`;
            }

            // 3. Price Extraction
            const prMatch = line.match(/(?:CELKEM|SUMA|PLACENO)\s*[:.]?\s*([\d\s]+[.,]?[\d]{0,2})/i);
            if (!res.price && prMatch) {
                res.price = prMatch[1].trim().replace(/\s/g, '').replace('.', ',') + ' Kč';
            }
        });

        return res;
    }
};
