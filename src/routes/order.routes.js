// src/routes/order.routes.js - CÓDIGO FINAL DE RUTAS

import express from 'express';
import orderController from '../controllers/order.controller.js';

const router = express.Router();

// Rutas para la gestión de pedidos
router.route('/orders')
    .get(orderController.getOrders);

router.route('/orders/:id')
    .get(orderController.getOrderById);
    
router.route('/orders/:id/status')
    .put(orderController.updateOrderStatus);

// 🛑 EXPORTACIÓN DEFINITIVA Y CLARA 🛑
export default router;