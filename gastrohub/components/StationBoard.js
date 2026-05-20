import KanbanColumn from './KanbanColumn.js';

const { defineComponent } = Vue;

export default defineComponent({
    components: { KanbanColumn },
    props: {
        category: { type: String, required: true },
        pendingOrders: { type: Array, required: true },
        cookingOrders: { type: Array, required: true },
        completedOrders: { type: Array, required: true },
        activeCount: { type: Number, default: 0 },
        capacity: { type: Number, default: 8 },
        isTurboMode: { type: Boolean, default: false },
        capacityReached: { type: Boolean, default: false },
        formatTime: { type: Function, required: true },
        labels: {
            type: Object,
            default: () => ({
                pending: '⏳ K přípravě',
                cooking: '🔥 Probíhá',
                done: '✅ Hotovo',
                startBtn: '🔥 Spustit',
                finishBtn: '✅ Dokončit'
            })
        }
    },
    emits: ['start-action', 'finish-action', 'reorder'],
    template: `
        <section class="station-grid">
            <div class="capacity-dashboard-header">
                <div class="capacity-info">
                    <span class="label">{{ category.toUpperCase() }} KAPACITA</span>
                    <span class="value" :class="{ 'warning': capacityReached && !isTurboMode }">
                        {{ activeCount }} / {{ capacity }}
                    </span>
                </div>
                <div class="capacity-bar-bg">
                    <div class="capacity-bar-fill" :class="[category, { 'turbo': isTurboMode }]"
                         :style="{ width: Math.min(100, (activeCount / capacity) * 100) + '%' }"></div>
                </div>
                <div v-if="isTurboMode" class="turbo-badge">🚀 TURBO AKTIVNÍ</div>
            </div>
            
            <kanban-column :title="labels.pending" :orders="pendingOrders" :category="category" :status="category" :button-text="labels.startBtn" :button-class="'action-btn-' + category" :format-time="formatTime" :capacity-reached="capacityReached" @action="(p) => $emit('start-action', p)" @reorder="$e => $emit('reorder', $e)"></kanban-column>
            <kanban-column :title="labels.cooking" :orders="cookingOrders" :category="category" :status="category === 'pizza' ? 'baking' : 'grilling'" :button-text="labels.finishBtn" button-class="action-btn-success" :format-time="formatTime" @action="(p) => $emit('finish-action', p)"></kanban-column>
            <kanban-column :title="labels.done" :orders="completedOrders" :category="category" status="done" :format-time="formatTime"></kanban-column>
        </section>
    `
});