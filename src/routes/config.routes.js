// src/routes/config.routes.js

import express from 'express';
// 🛑 RUTA AL CONTROLADOR Y EXPORTACIONES NOMBRADAS CORRECTAS 🛑
import { 
    getGlobalConfigController, 
    updateGlobalConfigController 
} from '../controllers/config.controller.js'; // ⬅️ Ruta relativa corregida y capitalización de archivo

const router = express.Router();

// Ruta de prueba para GET /api/config
router.get('/', (req, res) => {
    res.json({ message: 'Ruta base de configuración registrada. Usa /global para datos.' });
});

// Rutas de API funcionales
router.get('/global', getGlobalConfigController); // ⬅️ USO DE FUNCIÓN IMPORTADA
router.put('/global', updateGlobalConfigController); // ⬅️ USO DE FUNCIÓN IMPORTADA

export default router; // ⬅️ EXPORTACIÓN POR DEFECTO DEL ROUTER