import { formatQty } from '../utils.js';

const { defineComponent } = Vue;

export default defineComponent({
    props: ['order'],
    emits: ['confirm', 'reset'],
    methods: { formatQty },
    template: `
        <div class="order-detail-form" style="background: #f1f2f6; padding: 15px; border-radius: 6px; margin-top: 15px; text-align: left;">
            <h4>Aktuálně zpracovávaný detail</h4>
            <div v-if="order.items && order.items.length > 0" style="margin: 10px 0; background: white; padding: 10px; border-radius: 6px; border: 1px solid #ddd; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);">
                <div v-for="(item, idx) in order.items" :key="idx" style="font-size: 0.85rem; margin-bottom: 8px; border-bottom: 1px dashed #eee; padding-bottom: 6px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; font-weight: 600;">
                        <span>{{ formatQty(item.quantity) }}x {{ item.name }}</span>
                        <span>{{ ((item.price || 0) + (item.extrasPrice || 0)) * (item.quantity || 1) }} Kč</span>
                    </div>
                    <div v-if="item.extras" style="font-size: 0.75rem; color: #d35400; margin-left: 10px; margin-top: 2px;">+ {{ item.extras }} (+{{ item.extrasPrice }} Kč)</div>
                </div>
            </div>
            
            <div style="margin-bottom: 10px;">
                <label style="display:block; font-size: 0.8rem; color: #666;">Položka:</label>
                <input v-model="order.item" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" placeholder="Zadejte položku...">
            </div>
            
            <div style="margin-bottom: 10px;">
                <label style="display:block; font-size: 0.8rem; color: #666;">Adresa:</label>
                <input v-model="order.address" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;" placeholder="Zadejte adresu...">
            </div>
            
            <p style="font-size: 1.1rem; font-weight: bold; color: #2c3e50;">Celkem: {{ order?.price || 0 }} Kč</p>
            
            <div style="display: flex; gap: 10px;">
                <button @click="$emit('reset')" style="background: #95a5a6; color: white; border: none; padding: 10px 20px; font-weight: bold; flex: 1; border-radius: 4px; cursor: pointer;">🗑️ Vymazat</button>
                <button @click="$emit('confirm')" style="background: #2ed573; color: white; border: none; padding: 10px 20px; font-weight: bold; flex: 2; border-radius: 4px; cursor: pointer;">💾 Schválit</button>
            </div>
        </div>
    `
});