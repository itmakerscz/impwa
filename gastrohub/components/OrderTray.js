import { formatQty } from '../utils.js';
const { defineComponent } = Vue;

export default defineComponent({
    props: ['currentOrder'],
    emits: ['edit-item-extras', 'remove-item', 'reset-order', 'confirm-order'],
    methods: { formatQty },
    template: `
        <div class="order-detail-card">
            <h4 class="section-header">Aktuálně zpracovávaný detail</h4>

            <div v-if="currentOrder.items && currentOrder.items.length > 0" class="itemized-breakdown">
                <div v-for="(item, idx) in currentOrder.items" :key="idx" 
                     class="itemized-breakdown-item" :class="{ 'is-rush': item.isRush }">
                    <div class="flex-group-between">
                        <div class="item-main-info">
                            <span class="item-number">{{ idx + 1 }}.</span>
                            <span class="item-qty">{{ formatQty(item.quantity) }}x</span>
                            <span class="item-name">{{ item.name }}</span>
                            <span v-if="item.isRush" class="rush-icon" title="Spěchá">⚡</span>
                        </div>
                        <div class="item-actions">
                            <button v-if="item.category === 'pizza' || item.category === 'grill'" 
                                    @click="$emit('edit-item-extras', item, idx)" 
                                    class="app-btn app-btn-icon-small">✏️</button>
                            <button @click="$emit('remove-item', idx)" 
                                    class="app-btn app-btn-icon-small" 
                                    style="color: var(--danger); border-color: var(--danger);">🗑️</button>
                            <span class="item-price-total">{{ ((item.price || 0) + (item.extrasPrice || 0)) * (item.quantity || 1) }} Kč</span>
                        </div>
                    </div>
                    <div v-if="item.extras" class="item-details" :class="item.extras.includes('❌') ? 'item-removed' : 'item-extras'">
                        {{ item.extras }}
                    </div>
                </div>
            </div>

            <div class="form-group">
                <label class="app-label">Adresa:</label>
                <input v-model="currentOrder.address" class="app-input" placeholder="Zadejte adresu...">
            </div>
            <div class="form-group">
                <label class="app-label">Telefon:</label>
                <input v-model="currentOrder.phone" type="tel" inputmode="tel" class="app-input" placeholder="Zadejte telefon...">
            </div>
            
            <p class="order-summary-info">
                <b>Stanice:</b> {{ currentOrder?.category === 'grill' ? '🥩 Gril' : '🍕 Pizza' }}
            </p>
            <p class="order-summary-total">Celkem: {{ currentOrder?.price || 0 }} Kč</p>
            
            <div class="flex-group" style="margin-top: var(--spacing-lg);">
                <button @click="$emit('reset-order')" class="app-btn app-btn-secondary" style="flex: 1;">🗑️ Vymazat</button>
                <button @click="$emit('confirm-order')" class="app-btn app-btn-success" style="flex: 2;">💾 Schválit do výroby</button>
            </div>
        </div>`
});