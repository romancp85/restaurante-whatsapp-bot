// src/routes/order.routes.js
import express from 'express';
import { getActiveOrders, updateOrderStatus } from '../controllers/order.controller.js';

const router = express.Router();

router.get('/', getActiveOrders); // GET /api/pedidos?businessId=...
router.put('/:id/status', updateOrderStatus); // PUT /api/pedidos/:id/status

export default router;