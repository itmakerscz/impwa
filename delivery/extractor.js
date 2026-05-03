// extractor.js
export const Extractor = {
    // Helper to fix common OCR misreads in numbers
    normalizeNumbers(str) {
        if (!str) return '';
        return str
            .replace(/S/g, '6')
            .replace(/[O|o]/g, '0')
            .replace(/i/g, '1')
            .replace(/B/g, '8')
            .replace(/\s/g, ''); // Remove spaces for raw data
    },

    patterns: {
        // Updated to catch "TEL : S02..." (misread 6) or "Tel. 257..."
        phone: /(?:tel|telefon)\s*[:.]?\s*(?:(?:\+|00)420[\s\/]*)?([\dSB]{3})[\s\-]*([\dSB]{3})[\s\-]*([\dSB]{3})/i,
        
        // Anchors on the ZIP code (3+2 digits) which is the most stable part of the address
        zipCity: /(\d{3}|1[iI0O]{2})\s?([0O\d]{2})\s+([a-zA-Zá-žÁ-Ž\s]{3,})/i,
        
        // Captures monetary values near keywords or at the end of lines
        price: /(?:CELKEM|SUMA|C\s*E\s*L\s*K\s*E\s*M|VISA)\s*[:.]?\s*(?:KC|KČ)?\s*([\d\s]+[.,][\d]{2})/i
    },

    extract(text) {
        const lines = text.split('\n');
        let result = { phone: '', address: '', price: '' };

        console.log("--- STARTING REFACTORED EXTRACTION ---");

        // Pass 1: Line by Line
        lines.forEach((line, index) => {
            const raw = line.trim();
            if (!raw) return;

            // 1. Extract Phone
            if (!result.phone) {
                const match = raw.match(this.patterns.phone);
                if (match) {
                    result.phone = this.normalizeNumbers(`${match[1]}${match[2]}${match[3]}`);
                    console.log(`Matched Phone on line ${index}: ${result.phone}`);
                }
            }

            // 2. Extract Price (Keyword based)
            if (!result.price) {
                const match = raw.match(this.patterns.price);
                if (match) {
                    result.price = match[1].trim().replace(/\s/g, '').replace('.', ',') + ' Kč';
                    console.log(`Matched Price on line ${index}: ${result.price}`);
                }
            }

            // 3. Extract Address (ZIP + City focus)
            if (!result.address) {
                const match = raw.match(this.patterns.zipCity);
                if (match) {
                    const streetLine = lines[index - 1] ? lines[index - 1].trim() : '';
                    const zip = this.normalizeNumbers(match[1] + match[2]);
                    const city = match[3].trim();
                    
                    // If the line above doesn't look like an ID number (IC/DIC), assume it's the street
                    const street = (!streetLine.includes('IC') && streetLine.length > 3) ? streetLine + ', ' : '';
                    result.address = `${street}${zip.slice(0,3)} ${zip.slice(3)} ${city}`;
                    console.log(`Matched Address on line ${index}`);
                }
            }
        });

        // Pass 2: Fallbacks for missed data
        this.applyFallbacks(lines, result);

        console.log("--- EXTRACTION COMPLETE ---", result);
        return result;
    },

    applyFallbacks(lines, result) {
        // Fallback for Price: Look for the last line that contains a price-like format
        // This solves the Yves Rocher issue where CELKEM and the value are separated
        if (!result.price) {
            for (let i = lines.length - 1; i >= 0; i--) {
                const line = lines[i].trim();
                const priceOnlyMatch = line.match(/([\d\s]+[.,]\d{2})(?:\s*K[CČ])?$/i);
                if (priceOnlyMatch && !line.includes('%')) { // Avoid tax % lines
                    result.price = priceOnlyMatch[1].trim().replace(/\s/g, '').replace('.', ',') + ' Kč';
                    console.log("Fallback Price found at end of receipt");
                    break;
                }
            }
        }

        // Clean up any remaining OCR artifacts in address
        if (result.address) {
            result.address = result.address.replace(/[iI]/g, '1');
        }
    }
};
