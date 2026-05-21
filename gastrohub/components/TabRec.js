import VoiceInputControl from './VoiceInputControl.js';
import TranscriptPanel from './TranscriptPanel.js';
import QuickMenuSelection from './QuickMenuSelection.js';
import OrderTray from './OrderTray.js';
import RecentOrders from './RecentOrders.js';

const { defineComponent } = Vue;

export default defineComponent({
    props: ['isListening', 'transcript', 'interimTranscript', 'currentOrder', 'volume', 'menuItems', 'dbOrders'],
    components: { VoiceInputControl, TranscriptPanel, QuickMenuSelection, OrderTray, RecentOrders },
    emits: ['toggle-listening', 'confirm-order', 'add-item', 'reset-order', 'edit-item-extras', 'remove-item'],
    template: `
        <section class="card">
            <h3>🎙️ Hlasový Zápisník</h3>
            <voice-input-control 
                :is-listening="isListening" 
                :volume="volume" 
                @toggle-listening="$emit('toggle-listening')" 
            />
            <transcript-panel 
                :transcript="transcript" 
                :interim-transcript="interimTranscript" 
            />
            <quick-menu-selection 
                :menu-items="menuItems" 
                @add-item="$emit('add-item', $event)" 
            />
            <order-tray 
                :current-order="currentOrder" 
                @edit-item-extras="(item, idx) => $emit('edit-item-extras', item, idx)"
                @remove-item="idx => $emit('remove-item', idx)"
                @reset-order="$emit('reset-order')"
                @confirm-order="$emit('confirm-order')" 
            />
            <recent-orders 
                :orders="dbOrders" 
            />
        </section>
    `
});