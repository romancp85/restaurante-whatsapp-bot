// src/controllers/order.controller.js - CÓDIGO FUNCIONAL

import Pedido from '../models/Pedido.js'; // Importamos el modelo de pedido
import logger from '../utils/logger.js';

const orderController = {
    // === 1. GET /api/orders: Listar pedidos ===
    async getOrders(req, res) {
        try {
            const query = req.query.status ? { estado: req.query.status } : {};

            const orders = await Pedido.find(query)
                .sort({ createdAt: -1 })
                .lean(); 

            return res.status(200).json(orders);
        } catch (error) {
            logger.error('Error al obtener la lista de pedidos:', error.message);
            return res.status(500).json({ mensaje: 'Error interno del servidor' });
        }
    },

    // === 2. GET /api/orders/:id: Obtener pedido individual ===
    async getOrderById(req, res) {
        try {
            const order = await Pedido.findById(req.params.id).lean();
            if (!order) {
                return res.status(404).json({ mensaje: 'Pedido no encontrado' });
            }
            return res.status(200).json(order);
        } catch (error) {
            logger.error(`Error al obtener pedido ${req.params.id}:`, error.message);
            return res.status(500).json({ mensaje: 'Error interno del servidor' });
        }
    },

    // === 3. PUT /api/orders/:id/status: Actualizar estado ===
    async updateOrderStatus(req, res) {
        const nuevoEstado = req.body.estado; 
        const estadosValidos = ['Pendiente', 'Confirmado', 'En Preparación', 'En Camino', 'Entregado', 'Cancelado'];

        if (!estadosValidos.includes(nuevoEstado)) {
            return res.status(400).json({ mensaje: 'Estado no válido' });
        }

        try {
            const updatedOrder = await Pedido.findByIdAndUpdate(
                req.params.id,
                { estado: nuevoEstado },
                { new: true, runValidators: true }
            ).lean();

            if (!updatedOrder) {
                return res.status(404).json({ mensaje: 'Pedido no encontrado para actualizar' });
            }
            logger.info(`Pedido #${req.params.id} actualizado a: ${nuevoEstado}`);
            return res.status(200).json(updatedOrder);

        } catch (error) {
            logger.error(`Error al actualizar estado del pedido ${req.params.id}:`, error.message);
            return res.status(500).json({ mensaje: 'Error interno del servidor' });
        }
    }
};

export default orderController; // ⬅️ ¡La exportación del objeto completo!