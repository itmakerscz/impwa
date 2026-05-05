// extractor.js
export const Extractor = {
    /**
     * Enforces the +420XXXXXXXXX format and fixes OCR errors
     */
    normalizePhone(str) {
        if (!str) return '';
        
        // 1. Fix common OCR hallucinations (S->6, O->0, i->1, B->8, l->1)
        let cleaned = str.replace(/S/g, '6')
                         .replace(/[Oo]/g, '0')
                         .replace(/[ilL]/g, '1')
                         .replace(/B/g, '8')
                         .replace(/\D/g, ''); // Remove all non-numeric characters

        // 2. Handle prefix logic
        // If 9 digits are found, prepend 420
        if (cleaned.length === 9) {
            cleaned = '420' + cleaned;
        } 
        // If more than 12 digits (e.g., 00420...), keep only the last 12
        else if (cleaned.length > 12) {
            cleaned = cleaned.slice(-12);
        }

        // 3. Final validation: must be 12 digits and start with 420
        return (cleaned.length === 12 && cleaned.startsWith('420')) 
            ? `+${cleaned}` 
            : '';
    },

    normalizePrice(str) {
        if (!str) return '';
        return str.trim().replace(/\s/g, '').replace('.', ',') + ' Kč';
    },

    extract(text) {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l);
        let res = { phone: '', address: '', price: '' };

        lines.forEach((line, i) => {
            // Match Phone: looking for +420, 420, or 9-digit blocks
            const phMatch = line.match(/(?:\+?420)?\s?([\dSB]{3})[\s\-]*([\dSB]{3})[\s\-]*([\dSB]{3})/);
            if (!res.phone && phMatch) {
                const rawPhone = phMatch[1] + phMatch[2] + phMatch[3];
                res.phone = this.normalizePhone(rawPhone);
            }

            // Match Address: Street Number, City or ZIP patterns
            const addrMatch = line.match(/^(\/\/\s*)?([a-zA-Zá-žÁ-Ž\s]+\s\d+),\s*([a-zA-Zá-žÁ-Ž\s]+)/);
            const zipMatch = line.match(/(\d{3}|1[iI0]{2})\s?([0\d]{2})\s+([a-zA-Zá-žÁ-Ž\s]{3,})/i);

            if (!res.address) {
                if (addrMatch) {
                    res.address = addrMatch[2] + ', ' + addrMatch[3];
                } else if (zipMatch) {
                    const zip = (zipMatch[1] + zipMatch[2]).replace(/\s/g, '');
                    const city = zipMatch[3].trim();
                    const prev = lines[i-1] || '';
                    const street = (prev.length > 4 && !prev.match(/IC|IČ|DIC|DIČ/i)) ? prev + ', ' : '';
                    res.address = `${street}${zip.slice(0,3)} ${zip.slice(3)} ${city}`;
                }
            }

            // Match Price: CELKEM, SUMA, etc.
            const prMatch = line.match(/(?:CELKEM|SUMA|PLACENO)\s*[:.]?\s*([\d\s]+[.,]?[\d]{0,2})/i);
            if (!res.price && prMatch) {
                res.price = this.normalizePrice(prMatch[1]);
            }
        });

        return res;
    }
};
