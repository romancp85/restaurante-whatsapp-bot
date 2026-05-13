// src/config/redis.js
import Redis from 'ioredis';

const memoryStore = new Map();
let isRedisReady = false;

// Conexión Redis para BullMQ (necesita ser un cliente ioredis estándar)
export const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null, // requerido por BullMQ
    enableReadyCheck: false,
});

connection.on('connect', () => {
    isRedisReady = true;
    console.log('✅ Redis conectado.');
});
connection.on('error', () => {
    isRedisReady = false;
});

// Adaptador de sesión (caché de menú, dedup de mensajes, etc.)
export const sessionAdapter = {
    async get(key) {
        if (isRedisReady) {
            try {
                const data = await connection.get(key);
                return data ? JSON.parse(data) : null;
            } catch {}
        }
        const local = memoryStore.get(key);
        return local ? JSON.parse(local) : null;
    },

    async set(key, value, ttl = 3600) {
        memoryStore.set(key, JSON.stringify(value));
        if (isRedisReady) {
            try {
                await connection.set(key, JSON.stringify(value), 'EX', ttl);
            } catch {}
        }
    },

    async del(key) {
        memoryStore.delete(key);
        if (isRedisReady) {
            try { await connection.del(key); } catch {}
        }
    }
};

