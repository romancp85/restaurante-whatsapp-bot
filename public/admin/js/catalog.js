// public/admin/js/catalog.js
import { api } from './api.js';

export const catalog = {
    items: [],
    currentModifiers: [],

    async load() {
        console.log("🍎 [Catalog] Iniciando carga de datos...");
        try {
            const data = await api.fetch('/api/menu');
            if (data && Array.isArray(data)) {
                this.items = data;
                console.log(`🍎 [Catalog] ${data.length} productos recibidos.`);
                this.renderTable();
                this.updateOrderSelect();
            } else {
                console.warn("🍎 [Catalog] El API no devolvió un array de productos.");
            }
        } catch (e) {
            console.error("🍎 [Catalog] Error en load:", e);
        }
    },

    renderTable() {
        const tbody = document.getElementById('catalog-table-body');
        if (!tbody) {
            console.error("❌ [Catalog] No se encontró el elemento 'catalog-table-body'");
            return;
        }

        if (this.items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="py-10 text-center text-slate-300 font-bold uppercase">No hay productos</td></tr>';
            return;
        }

        tbody.innerHTML = this.items.map(i => `
            <tr class="hover:bg-slate-50 transition-colors border-b border-slate-50">
                <td class="px-6 py-4">
                    <p class="font-bold text-slate-800 text-sm">${i.nombre || 'Sin nombre'}</p>
                    <p class="text-[10px] text-slate-400 truncate max-w-[200px]">${i.descripcion || ''}</p>
                </td>
                <td class="px-6 py-4">
                    <span class="px-2 py-1 bg-slate-100 text-slate-500 text-[9px] font-black rounded uppercase">${i.categoria || 'GENERAL'}</span>
                </td>
                <td class="px-6 py-4 text-sm font-bold text-slate-700">
                    $${((i.precioBase || 0) / 100).toFixed(2)}
                </td>
                <td class="px-6 py-4">
                    <span class="flex items-center gap-1.5 ${i.disponible ? 'text-emerald-500' : 'text-red-400'} text-[10px] font-bold uppercase">
                        <span class="w-1.5 h-1.5 rounded-full ${i.disponible ? 'bg-emerald-500' : 'bg-red-400'}"></span>
                        ${i.disponible ? 'Activo' : 'Agotado'}
                    </span>
                </td>
                <td class="px-6 py-4 text-right space-x-2 text-slate-400">
                    <button onclick="window.editProduct('${i._id}')" class="hover:text-indigo-600 transition-colors"><i class="fas fa-edit"></i></button>
                    <button onclick="window.deleteProduct('${i._id}')" class="hover:text-red-500 transition-colors"><i class="fas fa-trash"></i></button>
                </td>
            </tr>`).join('');
        
        console.log("✅ [Catalog] Tabla renderizada correctamente.");
    },

    renderModifiersUI() {
        const container = document.getElementById('modifiers-config-container');
        if (!container) return;

        if (this.currentModifiers.length === 0) {
            container.innerHTML = `<p class="text-center text-slate-300 text-[10px] py-4 italic">Sin extras.</p>`;
            return;
        }

        container.innerHTML = this.currentModifiers.map((grupo, gIdx) => `
            <div class="bg-slate-50 p-4 rounded-2xl border border-slate-200 relative mb-4">
                <button type="button" onclick="window.removeModifierGroup(${gIdx})" class="absolute top-2 right-2 text-slate-300 hover:text-red-500"><i class="fas fa-times"></i></button>
                <input type="text" value="${grupo.nombre}" onchange="window.updateModifierGroup(${gIdx}, 'nombre', this.value)" placeholder="Ej: Extras" class="w-full mb-3 px-3 py-2 text-xs font-bold rounded-lg border border-slate-200">
                <div class="space-y-2">
                    ${(grupo.opciones || []).map((opt, oIdx) => `
                        <div class="flex gap-2">
                            <input type="text" value="${opt.nombre}" onchange="window.updateModifierOption(${gIdx}, ${oIdx}, 'nombre', this.value)" class="flex-1 px-2 py-1 text-xs rounded border border-slate-100">
                            <input type="number" value="${(opt.precioAdicional || 0) / 100}" onchange="window.updateModifierOption(${gIdx}, ${oIdx}, 'precioAdicional', this.value)" class="w-16 px-2 py-1 text-xs rounded border border-slate-100">
                            <button type="button" onclick="window.removeModifierOption(${gIdx}, ${oIdx})" class="text-slate-300 hover:text-red-400"><i class="fas fa-minus-circle"></i></button>
                        </div>
                    `).join('')}
                    <button type="button" onclick="window.addModifierOption(${gIdx})" class="text-[9px] font-bold text-indigo-500">+ OPCIÓN</button>
                </div>
            </div>`).join('');
    },

    updateOrderSelect() {
        const select = document.getElementById('prod-select');
        if (select) {
            select.innerHTML = '<option value="">-- Selecciona --</option>' + 
                this.items.filter(i => i.activo).map(i => `<option value="${i._id}">${i.nombre} - $${((i.precioBase || 0)/100).toFixed(2)}</option>`).join('');
        }
    }
};

// --- VÍNCULOS GLOBALES ---
window.openProductModal = (isEdit = false) => {
    document.getElementById('modal-product').classList.remove('hidden');
    document.getElementById('product-modal-title').textContent = isEdit ? 'Editar Producto' : 'Nuevo Producto';
    if (!isEdit) {
        document.getElementById('product-form').reset();
        document.getElementById('prod-id').value = "";
        catalog.currentModifiers = [];
        catalog.renderModifiersUI();
    }
};

window.closeProductModal = () => document.getElementById('modal-product').classList.add('hidden');

window.editProduct = (id) => {
    const item = catalog.items.find(i => i._id === id);
    if (!item) return;

    document.getElementById('prod-id').value = item._id;
    document.getElementById('prod-name-input').value = item.nombre || '';
    document.getElementById('prod-price-input').value = (item.precioBase || 0) / 100;
    document.getElementById('prod-cat-input').value = item.categoria || '';
    document.getElementById('prod-desc-input').value = item.descripcion || '';
    document.getElementById('prod-avail-input').checked = item.disponible !== false;
    document.getElementById('prod-stock-input').value = item.cantidad_diaria || 99;
    document.getElementById('prod-type-input').value = item.tipoProducto || 'simple';

    catalog.currentModifiers = JSON.parse(JSON.stringify(item.modificadores || []));
    catalog.renderModifiersUI();
    window.openProductModal(true);
};

window.addModifierGroup = () => {
    catalog.currentModifiers.push({ nombre: "Nuevo Grupo", opciones: [] });
    catalog.renderModifiersUI();
};

window.removeModifierGroup = (gIdx) => {
    catalog.currentModifiers.splice(gIdx, 1);
    catalog.renderModifiersUI();
};

window.addModifierOption = (gIdx) => {
    if (!catalog.currentModifiers[gIdx].opciones) catalog.currentModifiers[gIdx].opciones = [];
    catalog.currentModifiers[gIdx].opciones.push({ nombre: "Nueva Opción", precioAdicional: 0, disponible: true });
    catalog.renderModifiersUI();
};

window.removeModifierOption = (gIdx, oIdx) => {
    catalog.currentModifiers[gIdx].opciones.splice(oIdx, 1);
    catalog.renderModifiersUI();
};

window.updateModifierGroup = (gIdx, field, value) => { catalog.currentModifiers[gIdx][field] = value; };

window.updateModifierOption = (gIdx, oIdx, field, value) => {
    let val = value;
    if (field === 'precioAdicional') val = Math.round(parseFloat(value || 0) * 100);
    catalog.currentModifiers[gIdx].opciones[oIdx][field] = val;
};

window.deleteProduct = async (id) => {
    if (!confirm("¿Seguro que deseas eliminar este producto?")) return;
    await api.fetch(`/api/menu/${id}`, 'DELETE');
    catalog.load();
};