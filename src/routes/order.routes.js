// src/routes/order.routes.js
import express from 'express';
import { verificarToken } from '../middleware/auth.middleware.js';
// 🛑 ASEGÚRATE DE QUE ESTÉ EN ESTA LISTA 🛑
import { 
    getActiveOrders, 
    updateOrderStatus, 
    createDirectOrder 
} from '../controllers/order.controller.js';

const router = express.Router();

// 🛡️ Todas las rutas de abajo requieren token
router.use(verificarToken); 

router.get('/', getActiveOrders); 
router.put('/:id/status', updateOrderStatus);
router.post('/directo', createDirectOrder);

export default router;