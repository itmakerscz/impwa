// composables/useModal.js
const { ref } = Vue;

export function useModal() {
    const isVisible = ref(false);
    const title = ref('');
    const message = ref('');
    const isConfirm = ref(false);
    const type = ref('info');
    const icon = ref('ℹ️');
    const confirmText = ref('OK');
    const cancelText = ref('Zrušit');
    let resolvePromise = null;

    const iconMap = {
        info: 'ℹ️',
        success: '✅',
        warning: '⚠️'
    };

    /**
     * Internal engine to display the modal using an options object.
     * Refactored for 2026 clarity and extensibility.
     */
    const show = (options = {}) => {
        const {
            title: t,
            message: m,
            isConfirm: confirmMode = false,
            type: tType = 'info',
            icon: customIcon = null,
            confirmText: cText = null,
            cancelText: canText = null
        } = options;

        title.value = t || '';
        message.value = m || '';
        isConfirm.value = confirmMode;
        type.value = tType;
        icon.value = customIcon || iconMap[tType] || iconMap.info;
        confirmText.value = cText || (confirmMode ? 'Potvrdit' : 'OK');
        cancelText.value = canText || 'Zrušit';
        return new Promise((resolve) => {
            resolvePromise = resolve;
            isVisible.value = true;
        });
    };

    // Shorthand helpers that map positional arguments to the options object
    const info = (t, m, icon, cText) => alert(t, m, icon, cText);

    const confirm = (t, m, icon, cText, canText) => show({
        title: t, message: m, isConfirm: true, type: 'warning', icon, confirmText: cText, cancelText: canText
    });

    const alert = (t, m, icon, cText) => show({
        title: t, message: m, isConfirm: false, type: 'info', icon, confirmText: cText
    });

    const warning = (t, m, icon, cText) => show({
        title: t, message: m, isConfirm: false, type: 'warning', icon, confirmText: cText
    });

    const success = (t, m, icon, cText) => show({
        title: t, message: m, isConfirm: false, type: 'success', icon, confirmText: cText
    });

    const handleAction = (value) => {
        isVisible.value = false;
        if (resolvePromise) resolvePromise(value);
    };

    return {
        isVisible,
        title,
        message,
        isConfirm,
        type,
        icon,
        confirmText,
        cancelText,
        info,
        confirm,
        alert,
        warning,
        success,
        handleAction
    };
}