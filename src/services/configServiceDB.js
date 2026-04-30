// src/services/configServiceDB.js

import GlobalConfig from '../models/GlobalConfig.js';
import logger from '../utils/logger.js';

const CONFIG_KEY = 'GLOBAL_RESTAURANT';

/**
 * Garantiza que el documento de configuración exista en la DB y lo devuelve.
 * Si no existe, crea uno con valores por defecto.
 * @returns {Promise<Object>} El documento de configuración.
 */
export async function getGlobalConfig(businessId) {
    try {
        // Buscamos la configuración que pertenezca a este restaurante específico
        const config = await GlobalConfig.findOneAndUpdate(
            { businessId: businessId },
            { $setOnInsert: { businessId: businessId } }, 
            { new: true, upsert: true }
        );
        return config;
    } catch (error) {
        logger.error(`Error al obtener config para ${businessId}:`, error.message);
        return { acceptedPaymentMethods: ['Efectivo'], costoEnvioCents: 0 };
    }
}

/**
 * Actualiza los campos de configuración.
 * @param {Object} updateData Datos a actualizar (ej: { acceptedPaymentMethods: ['Efectivo'] })
 * @returns {Promise<Object>} El documento actualizado.
 */
export async function updateGlobalConfig(updateData) {
    try {
        const updatedConfig = await GlobalConfig.findOneAndUpdate(
            { clientId: CONFIG_KEY },
            { $set: updateData },
            { new: true }
        );
        return updatedConfig;
    } catch (error) {
        logger.error('Error al actualizar la configuración global:', error.message);
        throw new Error('No se pudo actualizar la configuración.');
    }
}