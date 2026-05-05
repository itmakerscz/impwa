// extractor.js
export const Extractor = {
    normalizePhone(str) {
        if (!str) return '';
        let cleaned = str.replace(/S/g, '6').replace(/[Oo]/g, '0').replace(/\D/g, '');
        if (cleaned.length === 9) cleaned = '420' + cleaned;
        return (cleaned.length === 12 && cleaned.startsWith('420')) ? `+${cleaned}` : '';
    },

    extract(text) {
        // We split the full text, but IMMEDIATELY filter for lines starting with //
        const relevantLines = text.split('\n')
            .map(l => l.trim())
            .filter(l => l.startsWith('//'));

        let res = { phone: '', address: '', price: '' };

        relevantLines.forEach((line) => {
            // Phone: strictly from // lines
            const phMatch = line.match(/(?:\+?420)?\s?([\dSB]{3})[\s\-]*([\dSB]{3})[\s\-]*([\dSB]{3})/);
            if (!res.phone && phMatch) {
                res.phone = this.normalizePhone(phMatch[1] + phMatch[2] + phMatch[3]);
            }

            // Address: strictly from // lines (format: // Street 123, City)
            const addrMatch = line.match(/^\/\/\s*([a-zA-Zá-žÁ-Ž\s]+\s\d+),\s*([a-zA-Zá-žÁ-Ž\s]+)/);
            if (!res.address && addrMatch) {
                res.address = `${addrMatch[1]}, ${addrMatch[2]}`;
            }

            // Price: strictly from // lines
            const prMatch = line.match(/(?:CELKEM|SUMA|PLACENO)\s*[:.]?\s*([\d\s]+[.,]?[\d]{0,2})/i);
            if (!res.price && prMatch) {
                res.price = prMatch[1].trim().replace(/\s/g, '').replace('.', ',') + ' Kč';
            }
        });

        return res;
    }
};
