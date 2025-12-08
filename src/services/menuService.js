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
const getMenu = async (clientId = 'default') => {
    
    const key = `menu_${clientId}`;
    const cached = CACHE.get(key);

    // 1. Verificar la caché en memoria
    if (cached && Date.now() - cached.timestamp < TTL) {
        logger.info('Cache hit: Devolviendo menú desde memoria.');
        return cached.data; 
    }

    try {
        // 2. CONSULTA DIRECTA CON DOBLE FILTRO: Activo (permanente) Y Disponible (hoy)
        // 🛑 FILTRO FINAL CORREGIDO 🛑
        const menu = await MenuItem.find({ activo: true, disponible: true }).lean();
        
        // 3. Almacenar el resultado en caché
        CACHE.set(key, { data: menu, timestamp: Date.now() }); 
        logger.info('Cache miss: Menú recargado desde DB y cacheado.');
        
        return menu;
        
    } catch (error) {
        logger.error('Error cargando menú desde MongoDB:', error.message);
        // En caso de error de DB, retornamos un array vacío
        return [];
    }
};

export { getMenu };