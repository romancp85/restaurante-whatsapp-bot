// src/config/redis.js

import Redis from 'ioredis';

// 1. Almacén de memoria local como fallback (no maneja TTL)
const memoryStore = new Map();

// 2. Cliente Redis
let client = null;
let isRedisReady = false;

// Intentar conectar a Redis
try {
  // Las opciones garantizan que no intenta reconectar infinitamente, prefiriendo fallar rápido.
  client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: 1,
    reconnectOnError: () => false,
    retryStrategy: () => null
  });

  client.on('connect', () => {
    isRedisReady = true;
    console.log('✅ Redis conectado y listo para usar.');
  });
  client.on('error', (err) => {
    isRedisReady = false;
    // console.warn('⚠️ Redis tuvo un error de conexión/comunicación.');
  }); 
} catch (e) {
  console.log('❌ Redis no instalado/configurado – usando memoria local para sesiones.');
}


// 3. Adaptador de Sesión que prioriza Redis y usa Map como fallback
const sessionAdapter = {
  // Obtiene la sesión, intenta con Redis, si falla o no está listo, usa Map
  async get(key) {
    // Si Redis está listo, intenta obtener de él (y maneja el JSON.parse)
    if (isRedisReady) {
      try {
        const data = await client.get(key);
        return data ? JSON.parse(data) : null;
      } catch (e) {
        // Falló la lectura de Redis (ej. timeout), retroceder a Map
      }
    }
    
    // Fallback a memoria local
    const local = memoryStore.get(key);
    return local ? JSON.parse(local) : null;
  },

  // Establece la sesión, guardando en ambos (Map siempre, Redis si está listo)
  async set(key, value, ttl = 3600) {
    // Guardamos el objeto como string JSON en Map
    memoryStore.set(key, JSON.stringify(value));
    
    // Si Redis está listo, intenta guardar con TTL
    if (isRedisReady) {
      try { 
          // 'EX' (Expire) con el TTL en segundos
          await client.set(key, JSON.stringify(value), 'EX', ttl); 
      } catch (e) {
          // Ignoramos errores de set para no interrumpir el flujo
      }
    }
  },

  // Elimina la sesión de ambos
  async del(key) {
    memoryStore.delete(key);
    if (isRedisReady) {
      try { await client.del(key); } catch {}
    }
  }
};

// Exportamos el adaptador de sesión
export { sessionAdapter };