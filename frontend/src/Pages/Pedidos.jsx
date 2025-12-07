import React, { useState, useEffect } from 'react';

// ===============================================================
// 1. UTILIDADES Y CONSTANTES
// ===============================================================

// Estados permitidos para la actualización
const NEXT_STATUSES = [
    'Confirmado', 
    'En Preparación', 
    'En Camino', 
    'Entregado', 
    'Cancelado'
];

function getStatusColor(status) {
    switch (status) {
        case 'Pendiente': return 'bg-yellow-100 text-yellow-800';
        case 'Confirmado': return 'bg-blue-100 text-blue-800';
        case 'En Preparación': return 'bg-indigo-100 text-indigo-800';
        case 'En Camino': return 'bg-green-100 text-green-800';
        case 'Entregado': return 'bg-gray-200 text-gray-700';
        case 'Cancelado': return 'bg-red-100 text-red-800';
        default: return 'bg-gray-100 text-gray-800';
    }
}

const formatPrice = (price) => `$${(price / 100).toFixed(2)}`;

// ===============================================================
// 2. Componente Modal de Detalles
// ===============================================================

const PedidoDetallesModal = ({ pedido, onClose }) => {
    if (!pedido) return null;

    return (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex justify-center items-center z-50 p-4">
            <div className="bg-white p-8 rounded-lg shadow-2xl w-full max-w-2xl max-h-full overflow-y-auto">
                <h2 className="text-2xl font-bold mb-4 text-red-600">
                    Detalles del Pedido #{pedido.numero_pedido}
                </h2>
                <p className={`mb-4 text-sm font-semibold px-3 py-1 rounded-full inline-block ${getStatusColor(pedido.estado)}`}>
                    Estado: {pedido.estado}
                </p>
                
                {/* Información del Cliente y Entrega */}
                <div className="grid grid-cols-2 gap-4 border-b pb-4 mb-4 text-sm">
                    <div>
                        <p className="font-medium text-gray-700">Cliente:</p>
                        <p>{pedido.nombreCliente}</p>
                        <p className="text-gray-500">Teléfono: {pedido.telefonoCliente}</p>
                    </div>
                    <div>
                        <p className="font-medium text-gray-700">Dirección de Entrega:</p>
                        <p>{pedido.direccionEntrega}</p>
                        <p className="text-gray-500">Método de Pago: {pedido.metodoPago}</p>
                    </div>
                </div>

                {/* Lista de Ítems */}
                <h3 className="text-lg font-semibold mb-3">Productos:</h3>
                <div className="space-y-3 mb-6 max-h-60 overflow-y-auto pr-2">
                    {pedido.items.map((item, index) => (
                        <div key={index} className="flex justify-between items-center text-sm border-b last:border-b-0 pb-1">
                            <div className="flex flex-col">
                                <span className="font-medium">{item.nombre} (x{item.cantidad})</span>
                                {item.notas && <span className="text-xs text-red-500 italic">Nota: {item.notas}</span>}
                            </div>
                            <span className="font-semibold">{formatPrice(item.precioUnitario * item.cantidad)}</span>
                        </div>
                    ))}
                </div>

                {/* Resumen Financiero */}
                <div className="text-right text-sm space-y-1">
                    <p>Subtotal: {formatPrice(pedido.subtotal)}</p>
                    <p>Costo de Envío: {formatPrice(pedido.costoEnvio)}</p>
                    <p className="text-lg font-bold border-t pt-2 mt-2">Total: {formatPrice(pedido.total)}</p>
                </div>
                
                <div className="mt-6 text-right">
                    <button
                        onClick={onClose}
                        className="bg-gray-800 hover:bg-gray-900 text-white font-bold py-2 px-4 rounded transition duration-150"
                    >
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
};


// ===============================================================
// 3. Componente Principal Pedidos
// ===============================================================

function Pedidos() {
    const [pedidos, setPedidos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');
    const [updatingId, setUpdatingId] = useState(null);
    const [selectedPedido, setSelectedPedido] = useState(null); // Estado para el modal de detalles

    useEffect(() => {
        fetchPedidos();
        // Recargar pedidos cada 30 segundos para ver nuevos pedidos
        const interval = setInterval(fetchPedidos, 30000); 
        return () => clearInterval(interval);
    }, []);

    const fetchPedidos = async () => {
        try {
            setLoading(true);
            setMessage('');
            const response = await fetch('/api/pedidos');
            if (!response.ok) throw new Error('Error al cargar pedidos.');
            
            const data = await response.json();
            setPedidos(data);
        } catch (error) {
            console.error('Fetch error:', error);
            setMessage('❌ Error al conectar con el servidor de pedidos.');
        } finally {
            setLoading(false);
        }
    };
    
    const handleStatusUpdate = async (pedidoId, nuevoEstado) => {
        setUpdatingId(pedidoId);
        setMessage('');

        try {
            const response = await fetch(`/api/pedidos/${pedidoId}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nuevoEstado }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Fallo al actualizar el estado.');
            }

            // Actualizar el estado localmente o recargar
            await fetchPedidos();
            setMessage(`✅ Pedido #${pedidos.find(p => p._id === pedidoId).numero_pedido} actualizado a ${nuevoEstado}.`);

        } catch (error) {
            console.error('Update error:', error);
            setMessage(`❌ Error al actualizar estado: ${error.message}`);
        } finally {
            setUpdatingId(null);
        }
    };

    // Funciones del Modal de Detalles
    const handleOpenDetails = (pedido) => {
        setSelectedPedido(pedido);
    };

    const handleCloseDetails = () => {
        setSelectedPedido(null);
    };


    if (loading && pedidos.length === 0) {
        return <p className="p-6 text-xl text-gray-500">Cargando pedidos activos...</p>;
    }
    
    return (
        <div className="p-6">
            <h1 className="text-3xl font-bold text-gray-800 mb-6 flex justify-between items-center">
                📋 Pedidos Activos ({pedidos.length})
                <button 
                    onClick={fetchPedidos} 
                    disabled={loading}
                    className="text-sm text-blue-600 hover:text-blue-800 disabled:text-gray-400"
                >
                    {loading ? 'Cargando...' : 'Recargar Lista'}
                </button>
            </h1>

            {message && (
                <div className={`p-3 mb-4 rounded text-sm ${message.startsWith('✅') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {message}
                </div>
            )}
            
            {pedidos.length === 0 && !loading ? (
                <p className="text-gray-500">No hay pedidos activos actualmente.</p>
            ) : (
                <div className="bg-white shadow-md rounded-lg overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase"># Pedido</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Cliente / Teléfono</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Total / Pago</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado Actual</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actualizar Estado</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Detalles</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {pedidos.map((pedido) => (
                                <tr key={pedido._id}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold">{pedido.numero_pedido}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        {pedido.nombreCliente}<br/>
                                        <span className="text-gray-500 text-xs">{pedido.telefonoCliente}</span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        {formatPrice(pedido.total)}<br/>
                                        <span className="text-xs font-medium text-indigo-600">{pedido.metodoPago}</span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(pedido.estado)}`}>
                                            {pedido.estado}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        <select
                                            className="border rounded px-2 py-1 text-sm focus:ring-red-500 focus:border-red-500"
                                            onChange={(e) => handleStatusUpdate(pedido._id, e.target.value)}
                                            disabled={updatingId === pedido._id}
                                            value={pedido.estado}
                                        >
                                            {NEXT_STATUSES.map(status => (
                                                <option key={status} value={status}>
                                                    {status}
                                                </option>
                                            ))}
                                        </select>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        <button 
                                            onClick={() => handleOpenDetails(pedido)} // ⬅️ Abre el modal
                                            className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                                        >
                                            Ver Items
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* MODAL DE DETALLES DEL PEDIDO */}
            {selectedPedido && (
                <PedidoDetallesModal 
                    pedido={selectedPedido} 
                    onClose={handleCloseDetails} 
                />
            )}
        </div>
    );
}

export default Pedidos;