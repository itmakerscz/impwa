import StationBoard from './StationBoard.js';

const { defineComponent } = Vue;

export default defineComponent({
    components: { StationBoard },
    props: ['pendingGrillOrders', 'grillingOrders', 'completedGrillOrders', 'formatTime', 'grillActiveCount', 'grillCapacity', 'isTurboMode', 'grillCapacityReached'],
    emits: ['start-grilling', 'finish-grilling', 'reorder'],
    template: `
        <station-board 
            category="grill"
            :pending-orders="pendingGrillOrders"
            :cooking-orders="grillingOrders"
            :completed-orders="completedGrillOrders"
            :active-count="grillActiveCount"
            :capacity="grillCapacity"
            :is-turbo-mode="isTurboMode"
            :capacity-reached="grillCapacityReached"
            :format-time="formatTime"
            :labels="{ pending: '⏳ K přípravě (Gril)', cooking: '🥩 Na roštu', done: '📦 Expedice Gril', startBtn: '🥩 Položit na gril', finishBtn: '✅ Hotovo' }"
            @start-action="p => $emit('start-grilling', p.order, p.item)"
            @finish-action="p => $emit('finish-grilling', p.order, p.item)"
            @reorder="$e => $emit('reorder', $e)"
        />
    `
});