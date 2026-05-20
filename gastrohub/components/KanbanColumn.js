import { formatTime } from '../utils.js';

const { defineComponent } = Vue;

export default defineComponent({
    props: {
        title: { type: String, required: true },
        orders: { type: Array, default: () => [] },
        category: { 
            type: String, 
            required: true,
            validator: value => ['pizza', 'grill'].includes(value)
        },
        status: { type: String, required: true },
        buttonText: { type: String, default: 'Akce' },
        buttonClass: { type: String, default: '' },
        formatTime: { type: Function, default: (s) => formatTime(s, "0:00") },
        capacityReached: { type: Boolean, default: false },
    },
    emits: ['action', 'reorder'],
    template: `
        <div class="col" :class="'font-' + status">
            <h4 style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                {{ title }}
                <span v-if="visibleItemsCount > 0" class="badge-count">{{ visibleItemsCount }}</span>
            </h4>
            <div v-for="order in orders" :key="order.id" class="order-group-container" style="margin-bottom: 15px;">
                <!-- Order Header (Visual Grouping) -->
                <div class="order-ticket-header">
                    <span class="ticket-id">#{{ order.id }}</span>
                    <span class="ticket-address">{{ order.address }}</span>
                </div>

                <!-- Individual Items in this Order matching the column status -->
                <div v-for="item in getVisibleItems(order)" :key="item.id" class="item-card"
                     :class="{ 'target-done': status === 'done', 'item-rush': item.isRush }" 
                     :style="getItemCardStyle(item)">
                    
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <h5 style="margin: 0; font-size: 1.1rem; font-weight: 700;">{{ item.name }}</h5>
                        <div v-if="status !== 'done'" style="font-size: 1rem;">
                            {{ category === 'pizza' ? '🍕' : '🥩' }}
                        </div>
                    </div>
                    
                    <div v-if="item.extras" class="item-extras-badge">
                        ✨ {{ item.extras }}
                    </div>

                    <template v-if="isCooking">
                        <div class="timer-display" :class="{ 'timer-urgent': (item.remainingTime || 0) < 30 }">
                            {{ formatTime(item.remainingTime || 0) }}
                        </div>
                        <div class="progress-container" style="height: 6px;">
                            <div :class="['progress-bar', category]" 
                                 :style="{ width: (item.progress || 0) + '%' }"></div>
                        </div>
                    </template>

                    <button v-if="status !== 'done'" 
                            :class="[buttonClass, { 'btn-disabled': isActionDisabled }]" 
                            :disabled="isActionDisabled" 
                            style="margin-top: 10px; width: 100%; padding: 8px; font-weight: bold; border-radius: 6px;" @click="$emit('action', { order, item })">
                        {{ isActionDisabled ? 'Kapacita plná' : buttonText }}
                    </button>
                </div>
            </div>
        </div>
    `,
    computed: {
        isCooking() {
            return this.status === 'baking' || this.status === 'grilling';
        },
        isActionDisabled() {
            const capacityLimitedStatuses = ['pizza', 'grill'];
            return this.capacityReached && capacityLimitedStatuses.includes(this.status);
        },
        visibleItemsCount() {
            return this.orders.reduce((acc, order) => acc + this.getVisibleItems(order).length, 0);
        }
    },
    methods: {
        getItemCardStyle(item) {
            if (this.status === 'done') return { marginBottom: '8px' };
            
            const baseColor = this.category === 'pizza' ? '#e67e22' : '#c0392b';
            let opacity = 1;
            
            // Visual "Heat" effect for items being cooked
            if (this.isCooking && item.progress) {
                opacity = 0.6 + (item.progress / 250);
            }

            return {
                borderLeft: `5px solid ${baseColor}`,
                marginBottom: '8px',
                backgroundColor: `rgba(255, 255, 255, ${opacity})`,
                boxShadow: item.remainingTime < 30 ? '0 0 10px rgba(231, 76, 60, 0.4)' : 'none'
            };
        },
        getVisibleItems(order) {
            // Map station status to individual item status
            const targetStatusMap = {
                'pizza': 'pending',
                'grill': 'pending',
                'baking': 'baking',
                'grilling': 'grilling',
                'done': 'done'
            };
            const targetStatus = targetStatusMap[this.status];
            return (order.items || []).filter(it => it.status === targetStatus && it.category === this.category);
        }
    }
});