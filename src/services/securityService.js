// src/services/securityService.js
import { connection as redis } from '../config/redis.js';
import logger from '../utils/logger.js';

/**
 * Algoritmo: Fixed Window Counter
 * Propósito: Blindar el sistema contra spam y ataques de denegación de servicio (DDoS)
 */
export const checkRateLimit = async (userId, businessId) => {
    // Definimos los límites (Configurables vía .env en el futuro)
    const USER_LIMIT = 10;      // 10 mensajes por minuto por usuario
    const BUSINESS_LIMIT = 100; // 100 mensajes por minuto por restaurante (SaaS Guard)
    const WINDOW = 60;          // Ventana de 60 segundos

    const userKey = `ratelimit:user:${userId}`;
    const businessKey = `ratelimit:biz:${businessId}`;

    try {
        // Ejecutamos ambas validaciones en paralelo para optimizar latencia
        const [userCount, bizCount] = await Promise.all([
            redis.incr(userKey),
            redis.incr(businessKey)
        ]);

        // Si es el primer mensaje de la ventana, establecemos expiración
        if (userCount === 1) await redis.expire(userKey, WINDOW);
        if (bizCount === 1) await redis.expire(businessKey, WINDOW);

        // 1. Validación de Usuario
        if (userCount > USER_LIMIT) {
            logger.warn(`🚫 [Security] Rate limit excedido por usuario: ${userId}`, { userId, count: userCount });
            return { allowed: false, reason: 'USER_SPAM' };
        }

        // 2. Validación de Negocio (Protección Multi-tenant)
        if (bizCount > BUSINESS_LIMIT) {
            logger.error(`🚨 [Security] Pico de tráfico detectado en Negocio: ${businessId}. Bloqueando preventivamente.`);
            return { allowed: false, reason: 'BUSINESS_OVERLOAD' };
        }

        return { allowed: true };

    } catch (error) {
        // Principio de Disponibilidad: Si Redis falla, dejamos pasar el mensaje
        // para no dejar al cliente colgado, pero alertamos en logs.
        logger.error(`⚠️ [Security] Error en Rate Limiter, permitiendo por bypass: ${error.message}`);
        return { allowed: true };
    }
};