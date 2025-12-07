import React, { useState, useEffect } from 'react';

// ===============================================================
// 1. Componente Modal para Crear/Editar Ítem
// ===============================================================

const MenuModal = ({ item, onClose, onSave }) => {
    // Lista simple de categorías para el dropdown
    const CATEGORIES = ['HAMBURGUESAS', 'COMPLEMENTOS', 'BEBIDAS', 'POSTRES'];

    // Inicializa el estado del formulario con el ítem existente o valores por defecto
    const [formData, setFormData] = useState({
        nombre: item?.nombre || '',
        // El precio se almacena en centavos en el backend, lo mostramos en pesos/dólares
        precio: item?.precio / 100 || 0, 
        categoria: item?.categoria || 'HAMBURGUESAS',
        cantidad_diaria: item?.cantidad_diaria || 0,
        alerta_en: item?.alerta_en || 5,
    });
    
    const isEditing = !!item;

    const handleChange = (e) => {
        const { name, value, type } = e.target;
        
        // Manejar el input de precio por separado para mantener el valor flotante en la UI
        if (name === 'precio') {
            const floatValue = parseFloat(value) || 0;
            setFormData({ ...formData, precio: floatValue });
            return;
        }

        setFormData({
            ...formData,
            // Convertir stock y alerta a número si aplica
            [name]: (type === 'number') ? Number(value) : value,
        });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        
        // El precio debe ser un entero (en centavos) antes de enviarse al backend
        const priceInCents = Math.round(formData.precio * 100); 

        // Llama a la función onSave con los datos limpios
        onSave({ 
            ...formData, 
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
                                value={formData.precio} // Mostrar el valor temporal flotante
                                onChange={handleChange}
                                required
                                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight"
                            />
                        </div>
                        <div className="w-1/2">
                            <label className="block text-gray-700 text-sm font-bold mb-2">Categoría</label>
                            <select
                                name="categoria"
                                value={formData.categoria}
                                onChange={handleChange}
                                className="shadow border rounded w-full py-2 px-3 text-gray-700 leading-tight"
                            >
                                {CATEGORIES.map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Stock y Alerta (en una fila) */}
                    <div className="flex space-x-4 mb-6">
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
// 2. Componente Principal Menu
// ===============================================================

function Menu() {
    const [menuItems, setMenuItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');
    const [editingId, setEditingId] = useState(null); 
    
    // Estados para CRUD
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [currentEditItem, setCurrentEditItem] = useState(null);

    useEffect(() => {
        fetchMenuItems();
    }, []);

    const fetchMenuItems = async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/menu');
            if (!response.ok) throw new Error('Error al cargar el menú.');
            
            const data = await response.json();
            setMenuItems(data);
        } catch (error) {
            console.error('Fetch error:', error);
            setMessage('❌ Error al conectar con el servidor de menú.');
        } finally {
            setLoading(false);
        }
    };

    // --- LÓGICA DE STOCK RÁPIDO ---
    const handleStockChange = (id, newStock) => {
        setMenuItems(menuItems.map(item =>
            item._id === id ? { ...item, cantidad_diaria: Number(newStock) } : item
        ));
    };

    const saveStock = async (id) => {
        setEditingId(id);
        setMessage('');

        const itemToUpdate = menuItems.find(item => item._id === id);

        try {
            const response = await fetch(`/api/menu/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ cantidad_diaria: itemToUpdate.cantidad_diaria }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Fallo al actualizar el stock.');
            }

            setMessage(`✅ Stock de ${itemToUpdate.nombre} actualizado.`);
        } catch (error) {
            console.error('Save error:', error);
            setMessage(`❌ Error al guardar stock: ${error.message}`);
        } finally {
            setEditingId(null);
        }
    };
    
    // --- LÓGICA DE MODAL (CRUD) ---
    const handleOpenModal = (item = null) => {
        setCurrentEditItem(item);
        setIsModalOpen(true);
    };

    const handleCloseModal = () => {
        setIsModalOpen(false);
        setCurrentEditItem(null);
    };
    
    const handleSaveItem = async (formData, isEditing) => {
        const method = isEditing ? 'PUT' : 'POST';
        const url = isEditing ? `/api/menu/${currentEditItem._id}` : '/api/menu';
        setMessage('Guardando ítem...');

        try {
            const response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Fallo al guardar el ítem.');
            }

            handleCloseModal();
            await fetchMenuItems(); 
            setMessage(`✅ Ítem ${isEditing ? 'actualizado' : 'creado'} con éxito.`);

        } catch (error) {
            console.error('CRUD Save error:', error);
            setMessage(`❌ Error al guardar: ${error.message}`);
        }
    };

    const handleDeleteItem = async (id, nombre) => {
        if (!window.confirm(`¿Estás seguro de que quieres eliminar "${nombre}" del menú?`)) {
            return;
        }
        
        setMessage(`Eliminando ${nombre}...`);
        try {
            const response = await fetch(`/api/menu/${id}`, { method: 'DELETE' });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Fallo al eliminar el ítem.');
            }

            await fetchMenuItems(); 
            setMessage(`✅ Ítem "${nombre}" eliminado con éxito.`);
        } catch (error) {
            console.error('CRUD Delete error:', error);
            setMessage(`❌ Error al eliminar: ${error.message}`);
        }
    };


    if (loading) {
        return <p className="p-6 text-xl text-gray-500">Cargando menú...</p>;
    }

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

            {/* BOTÓN DE AÑADIR PRODUCTO */}
            <div className="flex justify-end mb-4">
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
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones Stock</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Opciones CRUD</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {menuItems.map((item) => (
                            <tr key={item._id} className={item.cantidad_diaria <= item.alerta_en ? 'bg-yellow-50' : ''}>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                    {item.nombre}
                                    {item.cantidad_diaria <= item.alerta_en && (
                                        <span className="ml-2 text-xs text-red-600 font-semibold"> (¡STOCK BAJO!)</span>
                                    )}
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
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                    <button
                                        onClick={() => saveStock(item._id)}
                                        disabled={editingId === item._id}
                                        className="bg-blue-500 hover:bg-blue-600 text-white py-1 px-3 rounded text-xs disabled:opacity-50"
                                    >
                                        {editingId === item._id ? 'Guardando...' : 'Guardar'}
                                    </button>
                                </td>
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