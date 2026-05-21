const { defineComponent } = Vue;

export default defineComponent({
    props: ['transcript', 'interimTranscript'],
    template: `
        <div class="output-panel">
            <span class="transcript-final">{{ transcript }}</span>
            <span class="transcript-interim"> {{ interimTranscript }}</span>
            <div v-if="!transcript && !interimTranscript" class="transcript-placeholder">
                Zde se objeví váš text...
            </div>
        </div>
    `
});