// extractor.js
export const Extractor = {
    patterns: {
        // Updated: Handles OCR reading "S" instead of "6" or "O" instead of "0" 
        // Handles "TEL : 602..." and "Tel. 257..."
        phone: /(?:tel|telefon)\s*[:.]?\s*(?:(?:\+|00)420[\s\/]*)?(\d|[SBO]){3}[\s\-]*(\d|[SBO]){3}[\s\-]*(\d|[SBO]){3}/i,
        
        // Updated: Specifically looks for the Czech ZIP code format (5 digits) 
        // to avoid picking up random item descriptions.
        address: /(\d{3}\s?[0O\d]{2})\s+([a-zA-Zá-žÁ-Ž0-ž\s]{2,})/i,
        
        // Updated: Handles cases where "CELKEM" is on one line and the price is on the next (VISA line)
        // Also handles "." or "," as decimal separators and spaced "C E L K E M".
        price: /(?:CELKEM|SUMA|C\s*E\s*L\s*K\s*E\s*M|VISA)\s*[:.]?\s*(?:KC|KČ)?\s*([\d\s]+[.,][\d]{2})/i
    },

    extract(text) {
        const lines = text.split('\n');
        let extracted = { phone: '', address: '', price: '' };

        // Helper to normalize OCR characters
        const normalizeOCR = (str) => str.replace(/S/g, '6').replace(/O/g, '0').replace(/o/g, '0').replace(/i/g, '1');

        lines.forEach((line, index) => {
            const trimmedLine = line.trim();
            if (!trimmedLine) return;

            // 1. Phone: Normalize common OCR errors in numbers
            if (!extracted.phone) {
                const phMatch = trimmedLine.match(this.patterns.phone);
                if (phMatch) {
                    extracted.phone = normalizeOCR(`${phMatch[1]}${phMatch[2]}${phMatch[3]}`);
                }
            }

            // 2. Address: Look for ZIP code and City
            if (!extracted.address) {
                const adMatch = trimmedLine.match(this.patterns.address);
                if (adMatch) {
                    extracted.address = `${normalizeOCR(adMatch[1])} ${adMatch[2].trim()}`;
                }
            }

            // 3. Price: Check for labels and values
            if (!extracted.price) {
                const prMatch = trimmedLine.match(this.patterns.price);
                if (prMatch) {
                    extracted.price = prMatch[1].replace(/\s/g, '').replace('.', ',') + ' Kč';
                }
            }
        });

        // Special Fallback: If price is empty but we see a line with just a monetary value 
        // near the end of the receipt (common when "CELKEM" is on a separate line)
        if (!extracted.price) {
            for (let i = lines.length - 1; i >= 0; i--) {
                const valMatch = lines[i].match(/(\d+[\s.,]\d{2})(?:\s*K[CČ])?$/i);
                if (valMatch) {
                    extracted.price = valMatch[1].replace(/\s/g, '').replace('.', ',') + ' Kč';
                    break;
                }
            }
        }

        return extracted;
    }
};
