const { defineComponent } = Vue;

export default defineComponent({
    props: ['menuItems'],
    emits: ['add-item'],
    computed: {
        groupedMenu() {
            const items = Array.isArray(this.menuItems) ? this.menuItems : [];
            
            const usage = (() => {
                try {
                    return JSON.parse(localStorage.getItem('gastrohub_item_stats') || '{}');
                } catch (e) { return {}; }
            })();
            
            const groups = {
                frequent: { label: '⭐ Časté', items: [] },
                pizza: { label: '🍕 Pizzy', items: [] },
                grill: { label: '🥩 Gril', items: [] },
                drinks: { label: '🥤 Nápoje', items: [] }
            };

            if (items.length > 0) {
                // Identify top 4 most frequent items
                groups.frequent.items = [...items]
                    .filter(item => usage[item.name] > 0)
                    .sort((a, b) => (usage[b.name] || 0) - (usage[a.name] || 0))
                    .slice(0, 4);
                
                // Only show frequent if there are at least 2 items
                if (groups.frequent.items.length < 2) groups.frequent.items = [];

                items.forEach(item => {
                    const cat = item.category === 'grill' ? 'grill' : (item.category === 'drinks' ? 'drinks' : 'pizza');
                    if (groups[cat]) groups[cat].items.push(item);
                });
            }
            return groups;
        }
    },
    template: `
        <div class="menu-selection-area">
            <h4 class="section-header">Rychlý výběr z menu:</h4>
            <div v-for="(group, key) in groupedMenu" :key="key" 
                 :class="['menu-group', { 'menu-group-frequent': key === 'frequent' && group.items.length > 0 }]">
                <div v-if="group.items.length > 0">
                    <div class="menu-group-label">{{ group.label }}</div>
                    <div class="menu-chips-container">
                        <button v-for="item in group.items" :key="item.id" @click="$emit('add-item', item)" 
                                :class="['menu-chip', { 'menu-chip-frequent': key === 'frequent' }]">
                            <span>{{ item.category === 'grill' ? '🥩' : (item.category === 'drinks' ? '🥤' : '🍕') }}</span> {{ item.name }}
                        </button>
                    </div>
                </div>
            </div>
        </div>`
});