import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis(process.env.REDIS_URL);

export const orderQueue = new Queue('order-processing', { 
    connection,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 }
    }
});

/**
 * Función para encolar pedidos de cualquier fuente
 */
// Agrega estas opciones al añadir un job
export const enqueueOrder = async (source, data) => {
    await orderQueue.add(`${source}_${Date.now()}`, { source, ...data }, {
        removeOnComplete: true, // Borrar de Redis si sale bien
        removeOnFail: { age: 3600 * 24 }, // Borrar fallidos tras 24 horas
        attempts: 3,
        backoff: 1000
    });
};