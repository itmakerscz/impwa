// extractor.js
export const Extractor = {
    normalize(str) {
        if (!str) return '';
        // Fixes common OCR hallucinations: S->6, O->0, i->1, B->8
        return str.replace(/S/g, '6')
                  .replace(/[Oo]/g, '0')
                  .replace(/i/g, '1')
                  .replace(/B/g, '8')
                  .replace(/\s/g, '');
    },

    extract(text) {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l);
        let res = { phone: '', address: '', price: '' };

        lines.forEach((line, i) => {
            // 1. Phone: Matches +420... or 9-digit groups with OCR correction
            const phMatch = line.match(/(?:\+?420)?\s?([\dSB]{3})[\s\-]*([\dSB]{3})[\s\-]*([\dSB]{3})/);
            if (!res.phone && phMatch) {
                res.phone = this.normalize(phMatch[1] + phMatch[2] + phMatch[3]);
            }

            // 2. Address: Look for ZIP code (123 45) + City or "Street Number, City"
            const zipMatch = line.match(/(\d{3}|1[iI0]{2})\s?([0\d]{2})\s+([a-zA-Zá-žÁ-Ž\s]{3,})/i);
            const streetMatch = line.match(/[a-zA-Zá-žÁ-Ž\s]+\s\d+/);
            
            if (!res.address) {
                if (zipMatch) {
                    const zip = this.normalize(zipMatch[1] + zipMatch[2]);
                    const city = zipMatch[3].trim();
                    const prev = lines[i-1] || '';
                    // Check if previous line is a street (prevents picking up IC/DIC)
                    const street = (prev.length > 4 && !prev.match(/IC|IČ|DIC|DIČ/i)) ? prev + ', ' : '';
                    res.address = `${street}${zip.slice(0,3)} ${zip.slice(3)} ${city}`;
                } else if (streetMatch && line.includes(',')) {
                    res.address = line; 
                }
            }

            // 3. Price: Matches "CELKEM", "SUMA", or "PLACENO" followed by numbers
            const prMatch = line.match(/(?:CELKEM|SUMA|PLACENO|VISA|C\s*E\s*L\s*K\s*E\s*M)\s*[:.]?\s*([\d\s]+[.,]?[\d]{0,2})\s*(?:KC|KČ)?/i);
            if (!res.price && prMatch) {
                res.price = prMatch[1].trim().replace(/\s/g, '').replace('.', ',') + ' Kč';
            }
        });

        return res;
    }
};
