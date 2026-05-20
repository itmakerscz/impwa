const { defineComponent } = Vue;

export default defineComponent({
    props: ['id', 'activeTab', 'label', 'count'],
    emits: ['navigate'],
    template: `
        <button class="nav-btn" 
                :class="{ active: activeTab === id }" 
                @click="$emit('navigate', id)">
            {{ label }} <span v-if="count !== undefined && count !== null">({{ count }})</span>
        </button>
    `
});