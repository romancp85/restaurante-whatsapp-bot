// frontend/src/Pages/Configuracion.jsx

import React, { useState, useEffect } from 'react';

// Lista de todos los métodos de pago posibles que el bot puede manejar
const ALL_PAYMENT_METHODS = ['Efectivo', 'Transferencia', 'Tarjeta'];

function Configuracion() {
    const [config, setConfig] = useState({ acceptedPaymentMethods: [] });
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');
    
    // 1. Cargar la configuración actual al iniciar
    useEffect(() => {
        fetchConfig();
    }, []);

    const fetchConfig = async () => {
        try {
            setLoading(true);
            const response = await fetch('/api/config/global');
            if (!response.ok) throw new Error('Error al cargar la configuración.');
            
            const data = await response.json();
            setConfig(data);
            setLoading(false);
        } catch (error) {
            console.error('Fetch error:', error);
            setMessage('Error al conectar con el servidor de configuración.');
            setLoading(false);
        }
    };

    // 2. Manejar el cambio de checkboxes
    const handlePaymentChange = (method) => {
        const currentMethods = config.acceptedPaymentMethods;
        let newMethods;

        if (currentMethods.includes(method)) {
            // Eliminar el método si ya estaba seleccionado
            newMethods = currentMethods.filter(m => m !== method);
        } else {
            // Añadir el método si no estaba seleccionado
            newMethods = [...currentMethods, method];
        }

        setConfig({ ...config, acceptedPaymentMethods: newMethods });
        setMessage(''); // Limpiar mensajes al cambiar
    };

    // 3. Enviar la actualización al backend
    const handleSave = async () => {
        setLoading(true);
        setMessage('Guardando cambios...');
        
        try {
            const response = await fetch('/api/config/global', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    acceptedPaymentMethods: config.acceptedPaymentMethods 
                }),
            });

            const result = await response.json();

            if (!response.ok) {
                throw new Error(result.message || 'Error al guardar.');
            }

            setMessage('✅ Configuración de pagos guardada con éxito.');
        } catch (error) {
            console.error('Save error:', error);
            setMessage(`❌ Error al guardar: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    if (loading && config.acceptedPaymentMethods.length === 0) {
        return <p className="p-6 text-xl text-gray-500">Cargando configuración...</p>;
    }
    
    return (
        <div className="p-6">
            <h1 className="text-3xl font-bold text-gray-800 mb-6">
                ⚙️ Configuración Global del Restaurante
            </h1>
            
            {/* Sección de Métodos de Pago */}
            <div className="bg-white p-6 shadow-md rounded-lg">
                <h2 className="text-xl font-semibold mb-4 border-b pb-2 text-red-600">
                    Métodos de Pago Aceptados (para el Bot)
                </h2>
                
                <p className="text-sm text-gray-600 mb-4">
                    Selecciona qué opciones de pago se mostrarán a los clientes en el chat.
                </p>

                <div className="flex flex-wrap gap-6 mb-6">
                    {ALL_PAYMENT_METHODS.map((method) => (
                        <label key={method} className="flex items-center space-x-2 cursor-pointer">
                            <input
                                type="checkbox"
                                className="form-checkbox h-5 w-5 text-red-600 rounded"
                                checked={config.acceptedPaymentMethods.includes(method)}
                                onChange={() => handlePaymentChange(method)}
                                disabled={loading}
                            />
                            <span className="text-gray-700">{method}</span>
                        </label>
                    ))}
                </div>

                {/* Mensaje y Botón de Guardar */}
                {message && (
                    <p className={`text-sm mb-4 ${message.startsWith('✅') ? 'text-green-600' : 'text-red-600'}`}>
                        {message}
                    </p>
                )}
                
                <button
                    onClick={handleSave}
                    disabled={loading}
                    className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded transition duration-150 disabled:opacity-50"
                >
                    {loading ? 'Guardando...' : 'Guardar Cambios'}
                </button>
            </div>
            
            {/* Opcional: Futura Sección de Horarios */}
            <div className="bg-white p-6 shadow-md rounded-lg mt-6 opacity-50">
                <h2 className="text-xl font-semibold mb-4 border-b pb-2 text-gray-400">
                    Horarios de Operación (Próximamente)
                </h2>
                <p className="text-sm text-gray-400">
                    Aquí se gestionarán los días y turnos de atención.
                </p>
            </div>
        </div>
    );
}

export default Configuracion;