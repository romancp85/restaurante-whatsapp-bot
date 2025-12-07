// src/routes/menu.routes.js (VERSIÓN FINAL)

import express from 'express';
// Asegúrate de que esta importación de controlador sea correcta
import { 
    getAllMenuItems, 
    createMenuItem, 
    updateMenuItem, 
    deleteMenuItem 
} from '../controllers/menu.controller.js'; 

const router = express.Router();

// 🛑 RUTA BASE AHORA ES '/' (que se traduce a /api/menu) 🛑
router.route('/')
    .get(getAllMenuItems)   // Ahora GET /api/menu
    .post(createMenuItem); // Ahora POST /api/menu

// 🛑 RUTA ID AHORA ES '/:id' (que se traduce a /api/menu/:id) 🛑
router.route('/:id')
    .put(updateMenuItem)     
    .delete(deleteMenuItem); 

export default router;