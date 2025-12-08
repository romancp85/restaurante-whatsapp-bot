import React, { useState, useEffect } from 'react';
import axios from 'axios'; 

// ===============================================================
// 1. Componente Modal para Crear/Editar Ítem (FINAL CORREGIDO)
// ===============================================================

const MenuModal = ({ item, onClose, onSave }) => {
    // Lista simple de categorías para el dropdown
    const CATEGORIES = ['HAMBURGUESAS', 'COMPLEMENTOS', 'BEBIDAS', 'POSTRES'];

    // Inicializa el estado del formulario con el ítem existente o valores por defecto
    const [formData, setFormData] = useState({
        // Usamos la sintaxis simple (item?.prop || default) para las propiedades no booleanas
        nombre: item?.nombre || '',
        precio: item?.precio / 100 || 0, 
        categoria: item?.categoria || 'HAMBURGUESAS',
        cantidad_diaria: item?.cantidad_diaria || 0,
        alerta_en: item?.alerta_en || 5,
        
        // 🛑 CORRECCIÓN DE LA LÍNEA 21: Usamos el operador ternario simple 🛑
        // Si item existe, usamos su valor activo; si no, por defecto es true.
        activo: item ? item.activo : true, 
        disponible: item ? item.disponible : true, 
    });
    
    // NUEVOS ESTADOS PARA MANEJO DE CATEGORÍA LIBRE
    const [isNewCategory, setIsNewCategory] = useState(false);
    const [newCategoryText, setNewCategoryText] = useState('');
    
    const isEditing = !!item;

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        
        // Manejar la selección de categoría especial
        if (name === 'categoria') {
            if (value === 'NEW_CAT') {
                setIsNewCategory(true);
                setFormData({ ...formData, categoria: '' });
                return;
            } else {
                setIsNewCategory(false);
                setNewCategoryText('');
            }
        }
        
        if (name === 'precio') {
            const floatValue = parseFloat(value) || 0;
            setFormData({ ...formData, precio: floatValue });
            return;
        }

        setFormData({
            ...formData,
            [name]: (type === 'checkbox') ? checked : 
                    (type === 'number') ? Number(value) : value,
        });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        
        // LÓGICA CLAVE: USAR CATEGORÍA LIBRE SI APLICA 
        let finalCategory = formData.categoria;
        if (isNewCategory && newCategoryText.trim()) {
            finalCategory = newCategoryText.trim().toUpperCase();
        } else if (isNewCategory && !newCategoryText.trim()) {
            // Si intenta enviar una categoría nueva pero vacía, regresa.
            alert("Debes ingresar el nombre de la nueva categoría.");
            return;
        }
        
        const priceInCents = Math.round(formData.precio * 100); 

        // Llama a la función onSave con la categoría final limpia
        onSave({ 
            ...formData, 
            categoria: finalCategory, // Utilizamos la categoría final
            precio: priceInCents,
            cantidad_diaria: Number(formData.cantidad_diaria),
            alerta_en: Number(formData.alerta_en)
        }, isEditing);
    };

    return (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex justify-center items-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-2xl w-full max-w-lg">
                <h2 className="text-2xl font-bold mb-4 border-b pb-2 text-red-600">
                    {isEditing ? `Editar: ${item.nombre}` : 'Crear Nuevo Ítem'}
                </h2>
                <form onSubmit={handleSubmit}>
                    
                    {/* Nombre del Producto */}
                    <div className="mb-4">
                        <label className="block text-gray-700 text-sm font-bold mb-2">Nombre</label>
                        <input
                            type="text"
                            name="nombre"
                            value={formData.nombre}
                            onChange={handleChange}
                            required
                            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight"
                        />
                    </div>

                    {/* Precio y Categoría (en una fila) */}
                    <div className="flex space-x-4 mb-4">
                        <div className="w-1/2">
                            <label className="block text-gray-700 text-sm font-bold mb-2">Precio ($)</label>
                            <input
                                type="number"
                                name="precio"
                                step="0.01" 
                                value={formData.precio} 
                                onChange={handleChange}
                                required
                                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight"
                            />
                        </div>
                        <div className="w-1/2">
                            <label className="block text-gray-700 text-sm font-bold mb-2">Categoría</label>
                            
                            {/* LÓGICA HÍBRIDA DE CATEGORÍA */}
                            {!isNewCategory ? (
                                <select
                                    name="categoria"
                                    value={formData.categoria}
                                    onChange={handleChange}
                                    className="shadow border rounded w-full py-2 px-3 text-gray-700 leading-tight"
                                >
                                    {CATEGORIES.map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                    <option value="NEW_CAT">-- Crear Nueva Categoría --</option>
                                </select>
                            ) : (
                                <input
                                    type="text"
                                    name="newCategoryText"
                                    placeholder="Nueva Categoría (Ej: Postres)"
                                    value={newCategoryText}
                                    onChange={(e) => setNewCategoryText(e.target.value)}
                                    required
                                    className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight"
                                />
                            )}
                        </div>
                    </div>

                    {/* Stock y Alerta (en una fila) */}
                    <div className="flex space-x-4 mb-4">
                        <div className="w-1/2">
                            <label className="block text-gray-700 text-sm font-bold mb-2">Stock Diario</label>
                            <input
                                type="number"
                                name="cantidad_diaria"
                                value={formData.cantidad_diaria}
                                onChange={handleChange}
                                required
                                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight"
                            />
                        </div>
                        <div className="w-1/2">
                            <label className="block text-gray-700 text-sm font-bold mb-2">Alerta Stock en</label>
                            <input
                                type="number"
                                name="alerta_en"
                                value={formData.alerta_en}
                                onChange={handleChange}
                                required
                                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight"
                            />
                        </div>
                    </div>
                    
                    {/* CAMPOS BOOLEANOS (Activo / Disponible) */}
                    <div className="flex space-x-6 mb-6 pt-2 border-t mt-4">
                        <div className="w-1/2 flex items-center">
                            <input
                                type="checkbox"
                                id="disponible"
                                name="disponible"
                                checked={formData.disponible}
                                onChange={handleChange}
                                className="h-4 w-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                            />
                            <label htmlFor="disponible" className="ml-2 text-gray-700 text-sm font-bold">
                                Disponible Hoy ({formData.disponible ? 'Sí' : 'No'})
                            </label>
                        </div>
                        
                        <div className="w-1/2 flex items-center">
                            <input
                                type="checkbox"
                                id="activo"
                                name="activo"
                                checked={formData.activo}
                                onChange={handleChange}
                                className="h-4 w-4 text-red-600 border-gray-300 rounded focus:ring-red-500"
                            />
                            <label htmlFor="activo" className="ml-2 text-gray-700 text-sm font-bold">
                                Ítem Activo (Menú Permanente)
                            </label>
                        </div>
                    </div>


                    {/* Botones */}
                    <div className="flex justify-end space-x-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="bg-gray-300 hover:bg-gray-400 text-gray-800 font-bold py-2 px-4 rounded transition duration-150"
                        >
                            Cancelar
                        </button>
                        <button
                            type="submit"
                            className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded transition duration-150"
                        >
                            {isEditing ? 'Guardar Cambios' : 'Crear Producto'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};


// ===============================================================
// 2. Componente Principal Menu (CON LÓGICA DE FILTRADO)
// ===============================================================

function Menu() {
    const [menuItems, setMenuItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');
    const [editingId, setEditingId] = useState(null); 
    
    // Estados para CRUD y Filtro
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentEditItem, setCurrentEditItem] = useState(null);
    const [filterMode, setFilterMode] = useState('DISPONIBLE'); 


    // --- LÓGICA DE API (CRUD) ---

    const fetchMenuItems = async () => {
        setLoading(true);
        try {
            const response = await axios.get('/api/menu'); 
            setMenuItems(response.data);
        } catch (error) {
            setMessage('❌ Error al cargar los productos del menú.');
            console.error("Error al obtener el menú:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSaveItem = async (data, isEditing) => {
        try {
            if (isEditing) {
                const response = await axios.put(`/api/menu/${currentEditItem._id}`, data);
                setMessage(`✅ Producto "${response.data.nombre}" actualizado con éxito.`);
            } else {
                const response = await axios.post('/api/menu', data);
                setMessage(`✅ Producto "${response.data.nombre}" creado con éxito.`);
            }
            setIsModalOpen(false);
            setCurrentEditItem(null);
            fetchMenuItems(); // Recargar la lista
        } catch (error) {
            setMessage('❌ Error al guardar el producto.');
            console.error("Error al guardar ítem:", error.response?.data || error);
        }
    };

    const handleDeleteItem = async (id, nombre) => {
        if (!window.confirm(`¿Estás seguro de que deseas eliminar el producto "${nombre}"?`)) {
            return;
        }
        try {
            await axios.delete(`/api/menu/${id}`);
            setMessage(`✅ Producto "${nombre}" eliminado con éxito.`);
            fetchMenuItems();
        } catch (error) {
            setMessage('❌ Error al eliminar el producto.');
            console.error("Error al eliminar ítem:", error);
        }
    };

    const handleOpenModal = (item) => {
        setCurrentEditItem(item);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setCurrentEditItem(null);
    };

    const handleStockChange = (id, value) => {
        const newQuantity = Number(value);
        setMenuItems(prevItems => prevItems.map(item => 
            item._id === id ? { ...item, cantidad_diaria: newQuantity } : item
        ));
    };

    const saveStock = async (id) => {
        const itemToUpdate = menuItems.find(item => item._id === id);
        if (!itemToUpdate) return;
        
        setEditingId(id);
        try {
            await axios.put(`/api/menu/${id}`, { 
                cantidad_diaria: itemToUpdate.cantidad_diaria 
            });
            setMessage(`✅ Stock de ${itemToUpdate.nombre} actualizado a ${itemToUpdate.cantidad_diaria}.`);
        } catch (error) {
            setMessage(`❌ Error al actualizar stock de ${itemToUpdate.nombre}.`);
            console.error("Error al guardar stock:", error);
        } finally {
            setEditingId(null);
            fetchMenuItems(); 
        }
    };
    
    // --- LÓGICA DE FILTRADO EN EL CLIENTE ---
    
    const getFilteredItems = () => {
        return menuItems.filter(item => {
            switch (filterMode) {
                case 'ALL':
                    return true;
                case 'DISPONIBLE':
                    // Muestra items que están disponibles hoy Y activos
                    return item.disponible === true && item.activo === true; 
                case 'NO_DISPONIBLE':
                    // Muestra items que están activos, pero no disponibles (disponible: false)
                    return item.activo === true && item.disponible === false;
                case 'INACTIVO':
                    // Muestra items que están fuera del menú permanente (activo: false)
                    return item.activo === false;
                default:
                    return true;
            }
        });
    };

    useEffect(() => {
        fetchMenuItems();
    }, []);

    const filteredItems = getFilteredItems(); 

    if (loading) {
        return <p className="p-6 text-xl text-gray-500">Cargando menú...</p>;
    }

    // Sub-componente para los botones de filtro
    const FilterButton = ({ mode, label, colorClass, itemCount }) => (
        <button
            onClick={() => setFilterMode(mode)}
            className={`py-2 px-4 rounded transition duration-150 text-sm font-semibold 
                        ${filterMode === mode ? colorClass : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
        >
            {label} ({itemCount})
        </button>
    );

    // Contadores para el UI del filtro
    const counts = {
        ALL: menuItems.length,
        DISPONIBLE: menuItems.filter(i => i.disponible && i.activo).length,
        NO_DISPONIBLE: menuItems.filter(i => i.activo && !i.disponible).length,
        INACTIVO: menuItems.filter(i => !i.activo).length,
    };

    return (
        <div className="p-6">
            <h1 className="text-3xl font-bold text-gray-800 mb-6">
                🍔 Gestión de Menú y Stock Diario
            </h1>

            {message && (
                <div className={`p-3 mb-4 rounded text-sm ${message.startsWith('✅') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {message}
                </div>
            )}

            {/* BOTÓN DE AÑADIR PRODUCTO Y CONTROLES DE FILTRO */}
            <div className="flex justify-between mb-4">
                
                <div className="flex space-x-2">
                    <FilterButton mode="DISPONIBLE" label="✅ Disponibles Hoy" colorClass="bg-green-600 text-white" itemCount={counts.DISPONIBLE} />
                    <FilterButton mode="NO_DISPONIBLE" label="🟡 Ocultos (Activos)" colorClass="bg-yellow-600 text-white" itemCount={counts.NO_DISPONIBLE} />
                    <FilterButton mode="INACTIVO" label="❌ Descontinuados" colorClass="bg-red-600 text-white" itemCount={counts.INACTIVO} />
                    <FilterButton mode="ALL" label="Mostrar Todo" colorClass="bg-indigo-600 text-white" itemCount={counts.ALL} />
                </div>
                
                <button
                    onClick={() => handleOpenModal(null)}
                    className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded transition duration-150"
                >
                    ➕ Añadir Nuevo Producto
                </button>
            </div>
            
            {/* Tabla de Gestión Rápida de Stock y CRUD */}
            <div className="bg-white shadow-md rounded-lg overflow-hidden">
                <h2 className="text-xl font-semibold p-4 border-b text-red-600">
                    Stock Diario Rápido
                </h2>
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Producto</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Categoría</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Precio</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stock Diario</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Especial Hoy</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Activo</th> 
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones Rápida</th> 
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Opciones CRUD</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {filteredItems.map((item) => (
                            <tr key={item._id} 
                                className={
                                    item.cantidad_diaria <= item.alerta_en ? 'bg-yellow-50' : 
                                    !item.activo ? 'bg-gray-100 opacity-60' : 
                                    !item.disponible ? 'bg-yellow-50' : ''
                                }
                            >
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                    {item.nombre}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.categoria}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                    ${(item.precio / 100).toFixed(2)}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <input
                                        type="number"
                                        min="0"
                                        value={item.cantidad_diaria}
                                        onChange={(e) => handleStockChange(item._id, e.target.value)}
                                        className="w-20 border rounded px-2 py-1 text-sm text-center"
                                        disabled={editingId === item._id}
                                    />
                                </td>
                                
                                {/* Columna Disponibilidad */}
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${item.disponible ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                        {item.disponible ? 'Sí' : 'No'}
                                    </span>
                                </td>

                                {/* Columna Activo */}
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${item.activo ? 'bg-indigo-100 text-indigo-800' : 'bg-gray-100 text-gray-800'}`}>
                                        {item.activo ? 'Menú' : 'Fuera'}
                                    </span>
                                </td>

                                {/* Columna Acciones Rápida (Guardar Stock) */}
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                    <button
                                        onClick={() => saveStock(item._id)}
                                        disabled={editingId === item._id}
                                        className="bg-blue-500 hover:bg-blue-600 text-white py-1 px-3 rounded text-xs disabled:opacity-50"
                                    >
                                        {editingId === item._id ? 'Guardando...' : 'Guardar Stock'}
                                    </button>
                                </td>

                                {/* Columna Opciones CRUD */}
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                    <button
                                        onClick={() => handleOpenModal(item)}
                                        className="text-indigo-600 hover:text-indigo-900 mr-3 text-xs"
                                    >
                                        ✏️ Editar
                                    </button>
                                    <button
                                        onClick={() => handleDeleteItem(item._id, item.nombre)}
                                        className="text-red-600 hover:text-red-900 text-xs"
                                    >
                                        🗑️ Eliminar
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* MODAL DE EDICIÓN/CREACIÓN */}
            {isModalOpen && (
                <MenuModal 
                    item={currentEditItem} 
                    onClose={handleCloseModal} 
                    onSave={handleSaveItem} 
                />
            )}
        </div>
    );
}


export default Menu;