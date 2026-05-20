const { defineComponent } = Vue;

export default defineComponent({
    props: ['pizzaCapacity', 'grillCapacity', 'isTurboMode'],
    emits: ['update-settings', 'toggle-turbo-mode'],
    data() {
        return {
            localPizza: this.pizzaCapacity,
            localGrill: this.grillCapacity
        };
    },
    template: `
        <section class="card">
            <h3>⚙️ Nastavení Systému</h3>
            <div style="background: #f8f9fa; padding: 25px; border-radius: 12px; border: 1px solid #e1e8ed; margin-bottom: 25px;">
                <h4 style="margin-top: 0; color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 10px; display: inline-block;">Kapacita Výroby</h4>
                <p style="font-size: 0.9rem; color: #7f8c8d; margin-bottom: 20px;">Nastavte maximální počet položek, které lze současně zpracovávat v peci nebo na grilu.</p>
                
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 25px;">
                    <div class="form-group">
                        <label style="display: block; font-weight: bold; margin-bottom: 8px;">🍕 Limit Pece (Pizzy)</label>
                        <input type="number" v-model="localPizza" class="input-field" style="width: 100%; font-size: 1.2rem; text-align: center; border: 2px solid #ddd; border-radius: 8px; padding: 10px;">
                    </div>
                    <div class="form-group">
                        <label style="display: block; font-weight: bold; margin-bottom: 8px;">🥩 Limit Grilu (Položky)</label>
                        <input type="number" v-model="localGrill" class="input-field" style="width: 100%; font-size: 1.2rem; text-align: center; border: 2px solid #ddd; border-radius: 8px; padding: 10px;">
                    </div>
                </div>

                <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
                    <h4 style="margin-top: 0; color: #2c3e50; border-bottom: 2px solid #e74c3c; padding-bottom: 10px; display: inline-block;">Režim Turbo</h4>
                    <p style="font-size: 0.9rem; color: #7f8c8d; margin-bottom: 20px;">
                        V režimu Turbo jsou ignorovány limity kapacity pece a grilu. Použijte pouze ve špičce!
                    </p>
                    <button @click="$emit('toggle-turbo-mode')" :class="['action-btn-danger', { 'action-btn-success': isTurboMode }]" style="width: 100%; padding: 15px; font-size: 1.1rem;">
                        {{ isTurboMode ? '✅ Režim Turbo ZAPNUTÝ' : '❌ Režim Turbo VYPNUTÝ' }}
                    </button>
                </div>
                
                <button @click="$emit('update-settings', { pizza: localPizza, grill: localGrill })" class="action-btn-success" style="margin-top: 30px; width: 100%; padding: 15px; font-size: 1.1rem;">
                    💾 Uložit konfiguraci
                </button>
            </div>
        </section>
    `
});