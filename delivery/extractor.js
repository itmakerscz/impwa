// extractor.js
export const Extractor = {
    normalize(str) {
        if (!str) return '';
        // Fixes common OCR errors found in your data (S -> 6, O -> 0, i -> 1)
        return str.replace(/S/g, '6').replace(/[Oo]/g, '0').replace(/i/g, '1').replace(/\s/g, '');
    },

    extract(text) {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l);
        let res = { phone: '', address: '', price: '' };

        lines.forEach((line, i) => {
            // Phone: Handles "Tel. 257 313 222" and "TEL : S02..."
            if (!res.phone) {
                const phMatch = line.match(/(?:tel|telefon)\s*[:.]?\s*(?:(?:\+|00)420[\s\/]*)?([\dSB]{3})[\s\-]*([\dSB]{3})[\s\-]*([\dSB]{3})/i);
                if (phMatch) res.phone = this.normalize(phMatch[1] + phMatch[2] + phMatch[3]);
            }

            // Address: Captures ZIP code first, then looks back for the street
            if (!res.address) {
                const zipMatch = line.match(/(\d{3}|1[iI0]{2})\s?([0\d]{2})\s+([a-zA-Zá-žÁ-Ž\s]{3,})/i);
                if (zipMatch) {
                    const zip = this.normalize(zipMatch[1] + zipMatch[2]);
                    const city = zipMatch[3].trim();
                    const prev = lines[i-1] || '';
                    // Check if previous line is a street (and not an IČO/DIČO line)
                    const street = (prev.length > 4 && !prev.match(/IC|IČ|DIC|DIČ/i)) ? prev + ', ' : '';
                    res.address = `${street}${zip.slice(0,3)} ${zip.slice(3)} ${city}`;
                }
            }

            // Price: Handles "VISA 567,00", "CELKEM 2800,00" or "Celkem: 49.00"
            if (!res.price) {
                const prMatch = line.match(/(?:CELKEM|SUMA|VISA|K\s*U|C\s*E\s*L\s*K\s*E\s*M)\s*[:.]?\s*(?:KC|KČ)?\s*([\d\s]+[.,][\d]{2})/i);
                if (prMatch) res.price = prMatch[1].replace(/\s/g, '').replace('.', ',') + ' Kč';
            }
        });

        return res;
    }
};
