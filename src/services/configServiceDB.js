// src/services/configServiceDB.js

import GlobalConfig from '../models/GlobalConfig.js';
import logger from '../utils/logger.js';

const CONFIG_KEY = 'GLOBAL_RESTAURANT';

/**
 * Garantiza que el documento de configuración exista en la DB y lo devuelve.
 * Si no existe, crea uno con valores por defecto.
 * @returns {Promise<Object>} El documento de configuración.
 */
export async function getGlobalConfig() {
    try {
        // Busca o crea el documento único de configuración
        const config = await GlobalConfig.findOneAndUpdate(
            { clientId: CONFIG_KEY },
            { $setOnInsert: { clientId: CONFIG_KEY } }, // Solo establece el valor si es nuevo
            { new: true, upsert: true } // 'new: true' devuelve el documento actualizado/creado; 'upsert: true' lo crea si no existe
        );
        return config;

    } catch (error) {
        logger.error('Error al obtener/crear la configuración global:', error.message);
        // Devolver un valor de emergencia para que el bot no se rompa
        return { 
            acceptedPaymentMethods: ['Efectivo', 'Tarjeta'],
            closedMessage: "Error de sistema: Estamos cerrados temporalmente. Disculpa."
        };
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