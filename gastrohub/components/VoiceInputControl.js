const { defineComponent } = Vue;

export default defineComponent({
    props: ['isListening', 'volume'],
    emits: ['toggle-listening'],
    template: `
        <div class="flex-group" style="margin-bottom: var(--spacing-md);">
            <button @click="$emit('toggle-listening')" 
                :style="{ 
                    background: isListening ? '#e74c3c' : '#e67e22', 
                    color: 'white', border: 'none', padding: '15px 30px', 
                    borderRadius: '25px', fontSize: '1.1rem', cursor: 'pointer', margin: '15px 0' 
                }">
                {{ isListening ? '🛑 Zastavit nahrávání' : '🎙️ Spustit diktování' }}
            </button>
            
            <!-- Volume Meter -->
            <div v-if="isListening" class="volume-meter" 
                 style="flex-grow: 1; height: 12px; background: #ecf0f1; border-radius: 6px; overflow: hidden; max-width: 200px;">
                <div :style="{ width: volume + '%', background: '#2ed573', height: '100%', transition: 'width 0.1s ease' }"></div>
            </div>
        </div>
    `
});