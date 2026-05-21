const { defineComponent, ref, onMounted, onUnmounted } = Vue;

export default defineComponent({
    props: [
        'category',
        'pendingOrders',
        'cookingOrders',
        'completedOrders',
        'activeCount',
        'capacity',
        'isTurboMode',
        'capacityReached',
        'formatTime',
        'labels'
    ],
    emits: ['start-action', 'finish-action', 'cancel-action', 'reorder'],
    setup() {
        const currentTime = ref(Date.now());
        let intervalId = null;

        onMounted(() => {
            // Update current time every second to keep "Time in Queue" fresh
            intervalId = setInterval(() => {
                currentTime.value = Date.now();
            }, 1000);
        });

        onUnmounted(() => {
            if (intervalId) clearInterval(intervalId);
        });

        return {
            currentTime
        };
    },
    methods: {
        /**
         * Calculates percentage for the progress bar based on remaining time.
         */
        getProgress(order) {
            if (!order.bakingTotal) return 0;
            const elapsed = order.bakingTotal - (order.bakingRemaining || 0);
            return Math.min(100, Math.max(0, (elapsed / order.bakingTotal) * 100));
        },
        formatQueueTime(entryTime) {
            if (!entryTime) return 'N/A';
            const elapsedSeconds = Math.floor((this.currentTime - entryTime) / 1000);
            const minutes = Math.floor(elapsedSeconds / 60);
            const seconds = elapsedSeconds % 60;
            if (minutes === 0 && seconds === 0) return 'Právě přidáno';
            return `${minutes}m ${seconds}s`;
        }
    },
    template: `
        <div class="station-container">
            <!-- Capacity Info Banner: Native Android Look & Feel -->
            <div class="station-header" :class="{ 'warning': capacityReached && !isTurboMode, 'turbo': isTurboMode }" 
                 style="background: var(--bg-card); padding: 12px 20px; border-radius: var(--radius-lg); margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center; border: 1px solid var(--border-color); box-shadow: var(--shadow-sm);">
                <div class="flex-group">
                    <div :style="{ width: '14px', height: '14px', borderRadius: '50%', background: capacityReached && !isTurboMode ? '#d93025' : '#1e8e3e' }"></div>
                    <strong style="color: var(--text-contrast);">Obsazenost {{ category === 'grill' ? 'Grilu' : 'Pece' }}:</strong>
                    <span style="font-size: 1.1rem; font-weight: 600;">{{ activeCount }} / {{ capacity }}</span>
                </div>
                <div v-if="isTurboMode" style="background: #d93025; color: white; padding: 6px 16px; border-radius: 24px; font-size: 0.75rem; font-weight: bold; letter-spacing: 0.5px;">
                    🚀 TURBO REŽIM AKTIVNÍ
                </div>
            </div>

            <div class="station-grid">
                
                <!-- Sloupec 1: Fronta k přípravě (Pending) -->
                <div class="kanban-column">
                    <div style="font-weight: 600; color: var(--text-muted); margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; text-transform: uppercase; font-size: 0.85rem; letter-spacing: 0.8px;">
                        <span>{{ labels.pending }}</span>
                        <span style="background: #5f6368; color: white; padding: 2px 10px; border-radius: 12px; font-size: 0.75rem;">{{ pendingOrders.length }}</span>
                    </div>
                    <div class="column-items">
                        <div v-for="order in pendingOrders" :key="order.id" class="station-card" :class="{ 'item-rush': order.items.some(i => i.category === category && i.isRush) }">
                            <div style="display: flex; justify-content: space-between; font-size: 0.8rem; color: var(--text-muted); margin-bottom: 12px;">
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span style="font-weight: 500;">#{{ order.id }}</span>
                                    <span v-if="order.items.some(i => i.category === category && i.isRush)" 
                                          style="background: var(--danger); color: white; padding: 2px 8px; border-radius: var(--radius-sm); font-weight: bold; font-size: 0.7rem; animation: blink-rush 1s infinite;">
                                        ⚡ PRIORITNÍ
                                    </span>
                                </div>
                                <span style="font-size: 0.75rem; color: var(--text-muted);">Čeká: {{ formatQueueTime(order.entryTime) }}</span>
                            </div>
                            <div v-if="order.address" style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 12px;">📍 {{ order.address }}</div>

                            <!-- Ticket Items: Full context for Pending column -->
                            <div v-for="item in order.items.filter(i => i.category === category)" :key="item.id" 
                                 style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-input); padding: 8px 12px; border-radius: var(--radius-md); margin-bottom: 8px; border: 1px solid var(--border-light);"
                                 :style="{ opacity: item.status && item.status !== 'pending' ? '0.6' : '1' }">
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span v-if="item.status === 'done'">✅</span>
                                    <span v-else-if="item.status === 'baking' || item.status === 'grilling'">🔥</span>
                                    <span v-else>⏳</span>
                                    <span style="font-weight: 500; font-size: 1rem; color: var(--text-contrast);" :style="{ textDecoration: item.status === 'done' ? 'line-through' : 'none' }">
                                        {{ item.name }} <small v-if="item.extras">{{ item.extras }}</small>
                                    </span>
                                </div>
                                <button v-if="!item.status || item.status === 'pending'"
                                    @click="$emit('start-action', { order, item })"
                                    class="app-btn"
                                    style="min-height: 36px; padding: 0 16px; font-size: 0.8rem;"
                                    :class="category === 'grill' ? 'app-btn-grill' : 'app-btn-pizza'"
                                    :style="{ opacity: capacityReached && !isTurboMode ? '0.5' : '1' }"
                                    :disabled="capacityReached && !isTurboMode">
                                    {{ labels.startBtn }}
                                </button>
                                <span v-else style="font-size: 0.7rem; color: var(--text-muted); font-weight: bold; text-transform: uppercase;">
                                    {{ item.status === 'done' ? 'Hotovo' : 'V peci' }}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Sloupec 2: Právě ve výrobě (Cooking) -->
                <div class="kanban-column" style="border-color: var(--warning);">
                    <div style="font-weight: 600; color: var(--warning); margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; text-transform: uppercase; font-size: 0.85rem; letter-spacing: 0.8px;">
                        <span>{{ labels.cooking }}</span>
                        <span style="background: var(--warning); color: var(--text-contrast); padding: 2px 10px; border-radius: 12px; font-size: 0.75rem;">{{ cookingOrders.length }}</span>
                    </div>
                    <div class="column-items">
                        <div v-for="order in cookingOrders" :key="order.id" class="station-card" :class="{ 'item-rush': order.items.some(i => i.category === category && i.isRush) }" style="border-color: var(--warning);">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                                <div style="display: flex; align-items: center; gap: 8px;">
                                    <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 500;">#{{ order.id }}</span>
                                    <span v-if="order.items.some(i => i.category === category && i.isRush)" 
                                          style="background: var(--danger); color: white; padding: 2px 8px; border-radius: var(--radius-sm); font-weight: bold; font-size: 0.7rem; animation: blink-rush 1s infinite;">
                                        ⚡ PRIORITNÍ
                                    </span>
                                </div>
                            </div>
                            
                            <!-- Ticket Items: Full context for Cooking column -->
                            <div v-for="item in order.items.filter(i => i.category === category)" :key="item.id"
                                 style="background: var(--bg-card); border-radius: var(--radius-md); padding: 12px; margin-bottom: 12px; border: 1px solid var(--border-light); box-shadow: var(--shadow-sm);"
                                 :style="{ borderColor: (item.status === 'baking' || item.status === 'grilling') ? 'var(--warning)' : 'var(--border-light)', opacity: item.status === 'pending' || item.status === 'done' ? '0.7' : '1' }">
                                
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                                    <div style="display: flex; align-items: center; gap: 6px;">
                                        <span>{{ item.status === 'done' ? '✅' : (item.status === 'baking' || item.status === 'grilling' ? '🔥' : '⏳') }}</span>
                                        <span style="font-weight: 600; font-size: 1rem; color: var(--text-contrast);" :style="{ textDecoration: item.status === 'done' ? 'line-through' : 'none' }">
                                            {{ item.name }} <small v-if="item.extras">{{ item.extras }}</small>
                                        </span>
                                    </div>
                                    <div v-if="item.status === 'baking' || item.status === 'grilling'" class="timer" style="margin-bottom: 0; font-size: 1.1rem;" :class="{ 'blink': item.remainingTime <= 0 }">
                                        {{ formatTime(item.remainingTime) }}
                                    </div>
                                </div>

                                <template v-if="item.status === 'baking' || item.status === 'grilling'">
                                    <div class="progress-container" style="height: 6px; margin-bottom: 12px;">
                                        <div class="progress-bar" :class="{ 'grill': category === 'grill' }" :style="{ width: (item.progress || 0) + '%' }"></div>
                                    </div>
                                    <div style="display: flex; gap: 8px;">
                                        <button
                                            @click="$emit('cancel-action', { order, item })"
                                            class="app-btn app-btn-danger"
                                            style="flex: 1; min-height: 36px; padding: 0; font-size: 0.8rem;">
                                            ❌ Zrušit
                                        </button>
                                        <button 
                                            @click="$emit('finish-action', { order, item })"
                                            class="app-btn app-btn-success"
                                            style="flex: 2; min-height: 36px; padding: 0; font-size: 0.8rem;">
                                            {{ labels.finishBtn }}
                                        </button>
                                    </div>
                                </template>
                                <div v-else style="font-size: 0.75rem; color: var(--text-muted); font-style: italic;">
                                    {{ item.status === 'done' ? 'Dokončeno' : 'Čeká ve frontě...' }}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Sloupec 3: Dokončené (Completed) -->
                <div class="kanban-column" style="border-color: var(--success);">
                    <div style="font-weight: 600; color: var(--success); margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center; text-transform: uppercase; font-size: 0.85rem; letter-spacing: 0.8px;">
                        <span>{{ labels.done }}</span>
                        <span style="background: var(--success); color: white; padding: 2px 10px; border-radius: 12px; font-size: 0.75rem;">{{ completedOrders.length }}</span>
                    </div>
                    <div class="column-items">
                        <div v-for="order in completedOrders" :key="order.id" class="station-card" style="border-color: var(--success); opacity: 0.8;">
                            <div v-for="item in order.items.filter(i => i.category === category)" :key="item.id"
                                 style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px; font-size: 0.9rem;">
                                <span>{{ item.status === 'done' ? '✅' : (item.status === 'baking' || item.status === 'grilling' ? '🔥' : '⏳') }}</span>
                                <span :style="{ textDecoration: item.status === 'done' ? 'line-through' : 'none', color: item.status === 'done' ? 'var(--success)' : 'var(--text-muted)' }">
                                    {{ item.name }}
                                </span>
                            </div>
                            <div style="font-size: 0.75rem; color: var(--success); font-weight: bold; margin-top: 8px;">✅ PŘIPRAVENO</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `
});