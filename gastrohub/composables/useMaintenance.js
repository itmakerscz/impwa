// composables/useMaintenance.js
import { purgeOldOrders } from '../storage.js';

export function useMaintenance({ log }) {
    const runMaintenance = async (days = 30) => {
        try {
            const count = await purgeOldOrders(days);
            if (count > 0) {
                log(`Údržba: Vyčištěno ${count} starých objednávek.`, 'info');
            }
        } catch (err) {
            log(`Chyba při údržbě: ${err.message}`, 'error');
        }
    };

    return {
        runMaintenance
    };
}