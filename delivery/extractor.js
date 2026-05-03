// extractor.js
export const Extractor = {
    patterns: {
        // Your specific phone regex with capture groups
        phone: /(?i:tel)\s*[:.]?\s*(?:(?:\+|00)420[\s\/]*)?(\d{3})\s*(\d{3})\s*(\d{3})/,
        address: /[\w\s\.]{3,}\s\d{1,5}(?:\/\d{1,5})?,\s\d{3}\s\d{2}\s+[\w\s]{2,15}/,
        price: /(?:CELKEM|SUMA)\s*(?:KC)?\s*([\d\s]+,[\d]{2})/i
    },
    extract(text) {
        const lines = text.split('\n');
        let extracted = { phone: '', address: '', price: '' };

        console.log("--- LINE BY LINE ANALYSIS ---");

        lines.forEach((line, index) => {
            const trimmedLine = line.trim();
            if (!trimmedLine) return;

            console.log(`Line ${index}: "${trimmedLine}"`);

            // Phone
            if (!extracted.phone) {
                const phMatch = trimmedLine.match(this.patterns.phone);
                if (phMatch) {
                    extracted.phone = `${phMatch[1]}${phMatch[2]}${phMatch[3]}`;
                }
            }

            // Address
            if (!extracted.address) {
                const adMatch = trimmedLine.match(this.patterns.address);
                if (adMatch) {
                    extracted.address = adMatch[0].trim();
                }
            }

            // Price
            if (!extracted.price) {
                const prMatch = trimmedLine.match(this.patterns.price);
                if (prMatch) {
                    extracted.price = prMatch[1].trim() + ' Kč';
                }
            }
        });

        console.log("--- FINAL DATA ---", extracted);
        return extracted;
    }
};
