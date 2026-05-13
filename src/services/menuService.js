// src/services/menuService.js
// FIX: Caché migrada de Map() en proceso a Redis.
//
// El Map() anterior moría con el proceso y desincronizaba instancias en cluster.
// Con Redis la caché es compartida: si el Admin actualiza el menú en el Dashboard,
// el próximo mensaje de WhatsApp (incluso en otro proceso) verá el menú fresco.
//
// TTL: 60 segundos. Puedes ajustarlo con la variable MENU_CACHE_TTL en .env.
import MenuItem from '../models/MenuItem.js';
import { sessionAdapter } from '../config/redis.js';
import logger from '../utils/logger.js';

const TTL = parseInt(process.env.MENU_CACHE_TTL || '60', 10);

/**
 * Obtiene el menú activo y disponible para hoy, con caché Redis compartida.
 * @param {string} businessId
 * @returns {Promise<Array>} Lista de MenuItems
 */
export const getMenu = async (businessId) => {
    if (!businessId) return [];

    const cacheKey = `menu:${businessId}`;

    try {
        const cached = await sessionAdapter.get(cacheKey);
        if (cached) return cached; // sessionAdapter ya hace JSON.parse
    } catch {
        logger.warn('[MenuService] Redis no disponible, consultando DB directamente');
    }

    try {
        const diaActual = new Date().getDay();
        const menu = await MenuItem.find({
            businessId,
            activo: true,
            disponible: true,
            diasDisponibles: diaActual,
        }).lean();

        try {
            await sessionAdapter.set(cacheKey, menu, TTL);
        } catch {
            logger.warn('[MenuService] No se pudo guardar caché en Redis');
        }

        return menu;
    } catch (error) {
        logger.error('[MenuService] Error cargando menú:', error.message);
        return [];
    }
};

/**
 * Invalida la caché del menú de un negocio.
 * Llamar esto cuando el Admin guarda cambios en el catálogo.
 * @param {string} businessId
 */
export const invalidateMenuCache = async (businessId) => {
    if (!businessId) return;
    try {
        await sessionAdapter.del(`menu:${businessId}`);
        logger.info(`[MenuService] Caché invalidada para negocio ${businessId}`);
    } catch {
        logger.warn('[MenuService] No se pudo invalidar caché de menú');
    }
};
