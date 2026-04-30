// src/services/menuService.js - VERSIÓN FINAL CON FILTRO OPERACIONAL Y CACHÉ ACTIVA

import MenuItem from '../models/MenuItem.js'; 
import logger from '../utils/logger.js'; 
// Importamos axios para futuras interacciones, si es necesario
// import axios from 'axios'; 

// Usaremos Map() como caché temporal
const CACHE = new Map();
const TTL = 60_000; // 60 segundos (Puedes cambiar esto)

/**
 * Obtiene el menú de productos, priorizando la caché en memoria.
 * @param {string} clientId ID del restaurante (para caché multi-cliente).
 * @returns {Promise<Array>} Lista de objetos de menú.
 */
const getMenu = async (businessId) => {
    if (!businessId) return [];

    const cacheKey = `menu_${businessId}`; // 🛑 Definir la llave de caché
    const cached = CACHE.get(cacheKey);
    if (cached) return cached;

    try {
        const diaActual = new Date().getDay();
        const menu = await MenuItem.find({ 
            businessId: businessId,
            activo: true, 
            disponible: true,
            diasDisponibles: diaActual 
        }).lean();
        
        CACHE.set(cacheKey, menu);
        setTimeout(() => CACHE.delete(cacheKey), TTL);

        return menu;
    } catch (error) {
        logger.error('Error cargando menú multi-tenant:', error.message);
        return [];
    }
};

export { getMenu };