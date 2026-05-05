// extractor.js
export const Extractor = {
    normalize(str) {
        if (!str) return '';
        return str.replace(/S/g, '6').replace(/[Oo]/g, '0').replace(/i/g, '1').replace(/\s/g, '');
    },

    extract(text) {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l);
        let res = { phone: '', address: '', price: '' };

        lines.forEach((line) => {
            // Match Phone (handles // prefix if present)
            const phMatch = line.match(/(?:\+?420)?\s?([\dSB]{3})[\s\-]*([\dSB]{3})[\s\-]*([\dSB]{3})/);
            if (!res.phone && phMatch) res.phone = this.normalize(phMatch[1] + phMatch[2] + phMatch[3]);

            // Match Address (Street + Number, City)
            const addrMatch = line.match(/^(\/\/\s*)?([a-zA-Zá-žÁ-Ž\s]+\s\d+),\s*([a-zA-Zá-žÁ-Ž\s]+)/);
            if (!res.address && addrMatch) res.address = addrMatch[2] + ', ' + addrMatch[3];

            // Match Price (CELKEM: 290 Kč)
            const prMatch = line.match(/(?:CELKEM|SUMA|PLACENO)\s*[:.]?\s*([\d\s]+[.,]?[\d]{0,2})/i);
            if (!res.price && prMatch) res.price = prMatch[1].trim().replace(/\s/g, '').replace('.', ',') + ' Kč';
        });

        return res;
    }
};
