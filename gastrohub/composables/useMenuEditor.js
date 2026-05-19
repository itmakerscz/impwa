// composables/useMenuEditor.js
import { getMenu, saveMenuItem, deleteMenuItem } from '../storage.js';

const { ref, onMounted } = Vue;

export function useMenuEditor({ log, modal }) {
    const menuItems = ref([]);
    const editingItem = ref({ name: '', category: 'pizza', aliases: '', prepTime: 5 });

    const loadMenu = async () => {
        try {
            const items = await getMenu();
            menuItems.value = items || [];
        } catch (err) {
            log('Chyba při načítání menu: ' + err.message, 'error');
        }
    };

    const saveItem = async () => {
        if (!editingItem.value.name) return;
        
        try {
            const itemToSave = {
                ...editingItem.value,
                prepTime: parseInt(editingItem.value.prepTime || 5) * 60,
                aliases: typeof editingItem.value.aliases === 'string' 
                    ? editingItem.value.aliases.split(',').map(s => s.trim()).filter(s => s)
                    : editingItem.value.aliases
            };
            await saveMenuItem(itemToSave);
            editingItem.value = { name: '', category: 'pizza', aliases: '', prepTime: 5 };
            await loadMenu();
            log('Položka menu uložena.', 'success');
        } catch (err) {
            log('Chyba při ukládání položky: ' + err.message, 'error');
        }
    };

    const removeItem = async (id) => {
        const item = menuItems.value.find(i => i.id === id);
        const itemName = item ? ` "${item.name}"` : 'tuto položku';
        if (modal && !(await modal.confirm('Smazat recept', `Opravdu chcete smazat recept ${itemName}?`, null, 'Smazat'))) return;
        await deleteMenuItem(id);
        await loadMenu();
    };

    const editItem = (item) => {
        editingItem.value = { 
            ...item, 
            prepTime: item.prepTime ? item.prepTime / 60 : 5,
            aliases: (item.aliases || []).join(', ') 
        };
    };

    onMounted(loadMenu);

    return { menuItems, editingItem, saveItem, removeItem, editItem, loadMenu };
}