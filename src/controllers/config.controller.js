// src/controllers/config.controller.js

import { getGlobalConfig, updateGlobalConfig } from '../services/configServiceDB.js'; // ⬅️ Asumiendo que usas configServiceDB.js
import logger from '../utils/logger.js';

/**
 * @desc Obtener la configuración global (métodos de pago, mensaje de cerrado, etc.)
 * @route GET /api/config/global
 */
export const getGlobalConfigController = async (req, res) => { // ⬅️ EXPORTACIÓN NOMBRADA
    try {
        const config = await getGlobalConfig();
        res.status(200).json(config);
    } catch (error) {
        logger.error('Error al obtener la configuración global:', error);
        res.status(500).json({ message: 'Error interno al obtener la configuración.' });
    }
};

/**
 * @desc Actualizar la configuración global (métodos de pago, etc.)
 * @route PUT /api/config/global
 */
export const updateGlobalConfigController = async (req, res) => { // ⬅️ EXPORTACIÓN NOMBRADA
    try {
        const updateData = req.body;
        const updatedConfig = await updateGlobalConfig(updateData);
        res.status(200).json({ 
            message: 'Configuración actualizada con éxito.',
            config: updatedConfig
        });
    } catch (error) {
        logger.error('Error al actualizar la configuración global:', error);
        res.status(500).json({ message: 'Error interno al actualizar la configuración.' });
    }
};