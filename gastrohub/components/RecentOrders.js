const { defineComponent } = Vue;

export default defineComponent({
    props: ['orders'],
    computed: {
        recentOrders() {
            if (!Array.isArray(this.orders)) return [];
            // Sort by creation date descending to show the most recent first
            return [...this.orders]
                .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                .slice(0, 5);
        }
    },
    template: `
        <div class="recent-orders-section" style="margin-top: var(--spacing-lg); text-align: left;">
            <h4 class="section-header">🕒 Posledních 5 objednávek</h4>
            <div v-if="recentOrders.length === 0" class="empty-state" style="padding: 15px; font-size: 0.9rem;">
                Zatím nebyly uloženy žádné objednávky.
            </div>
            <div v-else class="recent-orders-list" style="display: flex; flex-direction: column; gap: 10px;">
                <div v-for="order in recentOrders" :key="order.id" 
                     class="recent-order-card" 
                     style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 12px; box-shadow: var(--shadow-sm);">
                    <div class="flex-group-between">
                        <span style="font-weight: bold; color: var(--primary);">#{{ order.id }}</span>
                        <span style="font-size: 0.75rem; color: var(--text-muted);">{{ new Date(order.created_at).toLocaleTimeString() }}</span>
                    </div>
                    <div style="font-size: 0.95rem; margin-top: 4px; font-weight: 500; color: var(--text-main);">{{ order.item }}</div>
                    <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 2px;">📍 {{ order.address }}</div>
                </div>
            </div>
        </div>
    `
});