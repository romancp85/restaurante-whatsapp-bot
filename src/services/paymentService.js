// src/services/paymentService.js

import logger from '../utils/logger.js';
// 🛑 CORRECCIÓN DE IMPORTS 🛑
import { getGlobalConfig } from './configServiceDB.js'; 

logger.info('--- ✅ MÓDULO paymentService.js CARGADO ---');

const DEFAULT_TRANSFER_MESSAGE = "🚨 No se pudieron cargar los datos bancarios. Por favor, consulta nuestro menú o contacta al restaurante.";
const DEFAULT_PAYMENT_METHODS = ['Efectivo'];

/**
 * @desc Obtiene la lista de métodos de pago aceptados de la configuración.
 * @returns {Array<string>} Lista de métodos de pago.
 */
export const getAcceptedPaymentMethods = async () => {
    try {
        // Usa la función robusta que busca/crea la configuración
        const config = await getGlobalConfig();
        
        // Asumiendo que el campo es 'acceptedPaymentMethods' en el documento principal
        const methods = config.acceptedPaymentMethods; 
        
        if (Array.isArray(methods) && methods.length > 0) {
            return methods;
        }
        
        logger.warn('Lista de pagos no encontrada en DB. Usando fallback.');
        return DEFAULT_PAYMENT_METHODS; 

    } catch (error) {
        logger.error('Error al obtener lista de pagos. Usando fallback.', error);
        return DEFAULT_PAYMENT_METHODS;
    }
};

/**
 * @desc Obtiene el mensaje de transferencia bancaria de la configuración global.
 * @returns {string} El mensaje con los datos de cuenta o un mensaje por defecto.
 */
export const getTransferDetailsMessage = async () => {
    try {
        const config = await getGlobalConfig();
        
        // Asumiendo que el campo es 'transferDetailsMessage' en el documento principal
        const message = config.transferDetailsMessage; 
        
        if (message) {
            return message;
        }
        
        return DEFAULT_TRANSFER_MESSAGE;

    } catch (error) {
        logger.error('Error al obtener datos de transferencia:', error);
        return DEFAULT_TRANSFER_MESSAGE;
    }
};