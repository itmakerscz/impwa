// extractor.js
export const Extractor = {
    patterns: {
        // Updated to handle "Tel. 123 456 789", "TEL : 123456789", and "Tel: 123 456 789"
        phone: /(?:tel|telefon)\s*[:.]?\s*(?:(?:\+|00)420[\s\/]*)?(\d{3})[\s\-]*(\d{3})[\s\-]*(\d{3})/i,
        
        // Matches typical Czech address: Street Number, ZIP City
        // e.g., "Václavské nám 47, Praha 1" or "V Podbabe 2549/15a Praha 6"
        address: /([a-zA-Zá-žÁ-Ž0-ž\s\.]+\s\d+(?:\/\w+)?),?\s*(\d{3}\s\d{2})\s+([a-zA-Zá-žÁ-Ž0-ž\s]+)/i,
        
        // Matches "CELKEM KC 567,00", "Celkem: 49,00 Kc", or "C E L K E M 2800,00Kč"
        // Captures the numeric part with the comma
        price: /(?:CELKEM|SUMA|C\s*E\s*L\s*K\s*E\s*M)\s*[:.]?\s*(?:KC|KČ)?\s*([\d\s]+[.,][\d]{2})/i
    },

    extract(text) {
        const lines = text.split('\n');
        let extracted = { phone: '', address: '', price: '' };

        console.log("--- LINE BY LINE ANALYSIS ---");

        lines.forEach((line, index) => {
            const trimmedLine = line.trim();
            if (!trimmedLine) return;

            console.log(`Line ${index}: "${trimmedLine}"`);

            // 1. Phone Extraction
            if (!extracted.phone) {
                const phMatch = trimmedLine.match(this.patterns.phone);
                if (phMatch) {
                    extracted.phone = `${phMatch[1]}${phMatch[2]}${phMatch[3]}`;
                }
            }

            // 2. Address Extraction (Attempts to match full address in one line)
            if (!extracted.address) {
                const adMatch = trimmedLine.match(this.patterns.address);
                if (adMatch) {
                    // Reconstructs as "Street Number, ZIP City"
                    extracted.address = `${adMatch[1].trim()}, ${adMatch[2]} ${adMatch[3].trim()}`;
                }
            }

            // 3. Price Extraction
            if (!extracted.price) {
                const prMatch = trimmedLine.match(this.patterns.price);
                if (prMatch) {
                    // Removes spaces from number (e.g., "2 800,00" -> "2800,00")
                    extracted.price = prMatch[1].replace(/\s/g, '') + ' Kč';
                }
            }
        });

        // Fallback for multi-line addresses (like the Yves Rocher receipt)
        // If address wasn't found in a single line, we look for the ZIP pattern specifically
        if (!extracted.address) {
            const zipMatch = text.match(/(\d{3}\s\d{2})\s+([a-zA-Zá-žÁ-Ž\s]+)/);
            if (zipMatch) {
                extracted.address = `${zipMatch[1]} ${zipMatch[2].trim()}`;
            }
        }

        console.log("--- FINAL DATA ---", extracted);
        return extracted;
    }
};
