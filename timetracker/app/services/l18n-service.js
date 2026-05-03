export const l18n = {
    translations: {},
    async init() {
        const res = await fetch('./app/services/l18n.json');
        this.translations = await res.json();
    },
    t(key, locale, params = {}) {
        let text = this.translations[locale]?.[key] || key;
        Object.keys(params).forEach(p => {
            text = text.replace(`{${p}}`, params[p]);
        });
        return text;
    }
};