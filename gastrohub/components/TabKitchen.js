import StationBoard from './StationBoard.js';

const { defineComponent } = Vue;

export default defineComponent({
    components: { StationBoard },
    props: ['pendingPizzaOrders', 'bakingPizzaOrders', 'completedPizzaOrders', 'formatTime', 'pizzaActiveCount', 'pizzaCapacity', 'isTurboMode', 'pizzaCapacityReached'],
    emits: ['start-pizza-baking', 'finish-pizza-baking', 'reorder'],
    template: `
        <station-board 
            category="pizza"
            :pending-orders="pendingPizzaOrders"
            :cooking-orders="bakingPizzaOrders"
            :completed-orders="completedPizzaOrders"
            :active-count="pizzaActiveCount"
            :capacity="pizzaCapacity"
            :is-turbo-mode="isTurboMode"
            :capacity-reached="pizzaCapacityReached"
            :format-time="formatTime"
            :labels="{ pending: '⏳ K pečení (Pec)', cooking: '🔥 V peci', done: '✅ Hotovo', startBtn: '🔥 Sázet do pece', finishBtn: '✅ Vyndat' }"
            @start-action="p => $emit('start-pizza-baking', p.order, p.item)"
            @finish-action="p => $emit('finish-pizza-baking', p.order, p.item)"
            @reorder="$e => $emit('reorder', $e)"
        />
    `
});