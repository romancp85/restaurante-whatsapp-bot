// src/routes/order.routes.js

import express from 'express';
// 🛑 IMPORTAR LAS NUEVAS FUNCIONES DESDE EL CONTROLADOR DE ÓRDENES 🛑
import { 
    getActiveOrders, 
    updateOrderStatus 
} from '../controllers/order.controller.js'; // Ajusta el nombre si tu controlador es 'pedido.controller.js'

const router = express.Router();

// 1. Obtener todos los pedidos activos para el panel
router.get('/', getActiveOrders); // GET /api/pedidos

// 2. Actualizar el estado de un pedido (ej: pasar de Pendiente a Confirmado)
router.put('/:id/status', updateOrderStatus); // PUT /api/pedidos/:id/status

export default router;