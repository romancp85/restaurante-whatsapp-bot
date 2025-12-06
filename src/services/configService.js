// src/services/configService.js - VERSIÓN FINAL PARA PANEL DE ADMIN

import Configuracion from '../models/Configuracion.js';
import logger from '../utils/logger.js'; // Ahora usamos logger

logger.info('--- ✅ MÓDULO configService.js CARGADO ---');

const CONFIG_CACHE = new Map();
const TTL = 60000; // 60 segundos (1 minuto)

const getHorariosConfig = async (clientId = 'default') => {
    const key = `config_${clientId}`;
    const cached = CONFIG_CACHE.get(key);

    if (cached && Date.now() - cached.timestamp < TTL) {
        return cached.data;
    }

    try {
        const config = await Configuracion.findOne({ nombre: 'horarios_operacion' }).lean();
        const data = config || { dias_operacion: [] };
        CONFIG_CACHE.set(key, { data: data, timestamp: Date.now() });
        return data;
    } catch (error) {
        logger.error('Error cargando configuración de horarios:', error.message);
        return { dias_operacion: [] }; 
    }
};

/**
 * Verifica si el negocio está abierto en la hora actual del servidor.
 */
export const isBusinessOpen = async () => {
    const config = await getHorariosConfig();
    
    if (!config || config.dias_operacion.length === 0) return { open: true }; 
    
    const now = new Date();
    const currentDayIndex = now.getDay(); 
    const dayNames = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
    const currentDayName = dayNames[currentDayIndex];
    const currentTime = now.getHours() * 60 + now.getMinutes(); 

    const todayConfig = config.dias_operacion.find(d => d.dia === currentDayName);

    if (!todayConfig || !todayConfig.activo) {
        return { open: false, message: config.mensaje_cerrado };
    }

    // DEBUGGING CRÍTICO
    logger.info(`[DEBUG HORARIO] Día: ${currentDayName}, Hora actual (minutos): ${currentTime}`);

    for (const turno of todayConfig.turnos) {
        const [openHour, openMinute] = turno.apertura.split(':').map(Number);
        const [closeHour, closeMinute] = turno.cierre.split(':').map(Number);
        
        const openTime = openHour * 60 + openMinute;
        const closeTime = closeHour * 60 + closeMinute;

        logger.info(`[DEBUG HORARIO] Turno ${turno.apertura}-${turno.cierre}: Open=${openTime}, Close=${closeTime}`);

        // Condición de apertura
        if (currentTime >= openTime && currentTime <= closeTime) {
            logger.info(`[DEBUG HORARIO] COINCIDENCIA ENCONTRADA. Abierto.`);
            return { open: true };
        }
    }

    logger.info(`[DEBUG HORARIO] Ningún turno coincide. Cerrado.`);
    
    return { open: false, message: config.mensaje_cerrado };
};