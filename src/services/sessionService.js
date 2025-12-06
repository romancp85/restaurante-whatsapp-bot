// src/services/sessionService.js
import { sessionAdapter } from '../config/redis.js'; 

// Constante para el tiempo de vida de la sesión (ej. 1 hora)
const SESSION_TTL_SECONDS = 3600; 

/**
 * Obtiene la sesión de un usuario, retorna un objeto (gracias al Adapter).
 * Si no existe, retorna una sesión inicial por defecto.
 */
const getUserSession = async (from, clientId = 'default') => {
    try {
        // El adapter ya devuelve un objeto parseado, o null
        const session = await sessionAdapter.get(`session:${clientId}:${from}`);
        
        // Si session es null o undefined, retorna el objeto inicial
        return session || { step: 'start', cart: [] };
    } catch (e) {
        console.error('Error al obtener sesión:', e);
        // En caso de error crítico, también retorna el objeto inicial
        return { step: 'start', cart: [] }; 
    }
};

/**
 * Guarda o actualiza la sesión de un usuario.
 */
const updateUserSession = async (from, session, clientId = 'default') => {
    try {
        // El adapter hace el JSON.stringify internamente
        await sessionAdapter.set(`session:${clientId}:${from}`, session, SESSION_TTL_SECONDS); 
    } catch (e) {
        console.error('Error al guardar sesión:', e);
    }
};

/**
 * Elimina la sesión de un usuario (usado al finalizar el pedido).
 */
const deleteUserSession = async (from, clientId = 'default') => {
    try {
        await sessionAdapter.del(`session:${clientId}:${from}`);
    } catch (e) {
        console.error('Error al eliminar sesión:', e);
    }
};


export { getUserSession, updateUserSession, deleteUserSession };