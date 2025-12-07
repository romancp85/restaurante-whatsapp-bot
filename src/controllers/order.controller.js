// src/controllers/order.controller.js (o pedido.controller.js)

import Pedido from '../models/Pedido.js';
import logger from '../utils/logger.js';

/**
 * @desc Obtener todos los pedidos activos (Pendiente, Confirmado, En Preparación, En Camino)
 * @route GET /api/pedidos
 */
export const getActiveOrders = async (req, res) => {
    try {
        const activeStatuses = ['Pendiente', 'Confirmado', 'En Preparación', 'En Camino'];
        
        // Obtenemos los pedidos, ordenados por el número de pedido (el más antiguo primero)
        const pedidos = await Pedido.find({ 
            estado: { $in: activeStatuses }
        }).sort({ numero_pedido: 1 }); 

        res.status(200).json(pedidos);
    } catch (error) {
        logger.error('Error al obtener pedidos activos:', error);
        res.status(500).json({ message: 'Error interno del servidor al obtener pedidos.' });
    }
};

/**
 * @desc Actualizar el estado de un pedido específico
 * @route PUT /api/pedidos/:id/status
 */
export const updateOrderStatus = async (req, res) => {
    const { id } = req.params;
    const { nuevoEstado } = req.body; // Esperamos { "nuevoEstado": "Confirmado" }

    try {
        const pedido = await Pedido.findById(id);

        if (!pedido) {
            return res.status(404).json({ message: 'Pedido no encontrado.' });
        }
        
        // Validación básica del estado (ya Mongoose lo validará con 'enum')
        pedido.estado = nuevoEstado;
        await pedido.save();
        
        // [FUTURO]: Aquí iría la lógica para enviar una notificación de WhatsApp al cliente.

        res.status(200).json({ 
            message: `Estado del pedido #${pedido.numero_pedido} actualizado a ${nuevoEstado}.`,
            pedido: pedido
        });

    } catch (error) {
        logger.error(`Error al actualizar estado del pedido ${id}:`, error);
        res.status(400).json({ message: 'Error al actualizar el estado.' });
    }
};

// Puedes añadir más funciones aquí si son necesarias