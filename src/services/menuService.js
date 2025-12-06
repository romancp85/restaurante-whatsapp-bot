// src/services/menuService.js - VERSIÓN MEJORADA CON CONEXIÓN DIRECTA A MONGO
import MenuItem from '../models/MenuItem.js'; // Importamos el modelo de la DB

// Usaremos Redis (a través del Adapter) para la caché de producción, 
// pero por ahora mantenemos el Map() como caché de emergencia.
const CACHE = new Map();
const TTL = 60_000; // 60 segundos

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
        return cached.data;
    }

    try {
        // 2. Si no hay caché o expiró, CONSULTAR DIRECTAMENTE A MONGO.
        // Solo traemos los ítems activos
        const menu = await MenuItem.find({ activo: true }).lean();
        
        // 3. Almacenar el resultado en caché
        CACHE.set(key, { data: menu, timestamp: Date.now() });
        return menu;
        
    } catch (error) {
        console.error('Error cargando menú desde MongoDB:', error.message);
        // En caso de error de DB, retornamos un array vacío
        return [];
    }
};

export { getMenu };