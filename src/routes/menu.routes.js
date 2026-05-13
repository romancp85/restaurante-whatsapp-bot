// src/routes/menu.routes.js
import express from 'express';
import { getMenuByBusiness, upsertMenuItem, deleteMenuItem } from '../controllers/menu.controller.js';
import { verificarToken } from '../middleware/auth.middleware.js';

const router = express.Router();

router.use(verificarToken); // 🔒 Protección SaaS

router.get('/', getMenuByBusiness);
router.post('/', upsertMenuItem); // 👈 Ahora el POST a /api/menu servirá para todo
router.delete('/:id', deleteMenuItem);

export default router;