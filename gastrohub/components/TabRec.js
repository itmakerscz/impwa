import { formatQty } from '../utils.js';
import OrderDetailForm from './OrderDetailForm.js';

const { defineComponent } = Vue;

export default defineComponent({
    props: ['isListening', 'transcript', 'interimTranscript', 'currentOrder', 'volume', 'menuItems'],
    components: { OrderDetailForm },
    emits: ['toggle-listening', 'confirm-order', 'add-item', 'reset-order'],
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
                grill: { label: '🥩 Gril', items: [] }
            };

            if (items.length > 0) {
                groups.frequent.items = [...items]
                    .filter(item => usage[item.name] > 0)
                    .sort((a, b) => (usage[b.name] || 0) - (usage[a.name] || 0))
                    .slice(0, 4);
                
                if (groups.frequent.items.length < 2) {
                    groups.frequent.items = [];
                }

                items.forEach(item => {
                    const cat = item.category === 'grill' ? 'grill' : 'pizza';
                    if (groups[cat]) groups[cat].items.push(item);
                });
            }

            return groups;
        }
    },
    methods: { formatQty },
    template: `
        <section class="card">
            <h3>🎙️ Hlasový Zápisník</h3>
            <div style="display: flex; align-items: center; gap: 20px;">
                <button @click="$emit('toggle-listening')" :style="{ background: isListening ? '#e74c3c' : '#e67e22', color: 'white', border: 'none', padding: '15px 30px', borderRadius: '25px', fontSize: '1.1rem', cursor: 'pointer', margin: '15px 0' }">
                    {{ isListening ? '🛑 Zastavit nahrávání' : '🎙️ Spustit diktování' }}
                </button>
                
                <div v-if="isListening" style="flex-grow: 1; height: 12px; background: #ecf0f1; border-radius: 6px; overflow: hidden; max-width: 200px;">
                    <div :style="{ width: volume + '%', background: '#2ed573', height: '100%', transition: 'width 0.1s ease' }"></div>
                </div>
            </div>

            <div class="output-panel" style="min-height: 100px; background: #fafafa; border: 1px solid #d1d5db; border-radius: 8px; padding: 12px; text-align: left; margin-bottom: 15px; font-size: 1.1rem;">
                <span style="color: #1f2937;">{{ transcript }}</span>
                <span style="color: #9ca3af; font-style: italic;"> {{ interimTranscript }}</span>
                <div v-if="!transcript && !interimTranscript" style="color: #9ca3af;">Zde se objeví váš text...</div>
            </div>

            <div style="margin: 15px 0; text-align: left;">
                <h4 style="margin-bottom: 15px; font-size: 0.95rem; color: #7f8c8d;">Rychlý výběr z menu:</h4>
                <div v-for="(group, key) in groupedMenu" :key="key" :style="key === 'frequent' && group.items.length > 0 ? { background: '#fff9db', padding: '12px', borderRadius: '12px', border: '1px dashed #f1c40f', marginBottom: '20px' } : { marginBottom: '20px' }">
                    <div v-if="group.items.length > 0">
                        <div style="font-size: 0.75rem; font-weight: bold; text-transform: uppercase; color: #95a5a6; margin-bottom: 8px; letter-spacing: 0.5px; border-bottom: 1px solid #eee; padding-bottom: 4px;">{{ group.label }}</div>
                        <div style="display: flex; gap: 10px; overflow-x: auto; padding-bottom: 10px; white-space: nowrap;">
                            <button v-for="item in group.items" :key="item.id" @click="$emit('add-item', item)" style="background: white; border: 1px solid #ddd; padding: 10px 20px; border-radius: 25px; cursor: pointer; font-size: 1rem; display: flex; align-items: center; gap: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); flex-shrink: 0;">
                                <span>{{ item.category === 'grill' ? '🥩' : '🍕' }}</span> {{ item.name }}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            
            <order-detail-form 
                :order="currentOrder"
                @confirm="$emit('confirm-order')"
                @reset="$emit('reset-order')"
            />
        </section>
    `
});