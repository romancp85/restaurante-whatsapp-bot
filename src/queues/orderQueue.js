// src/queues/orderQueue.js
import { Queue } from 'bullmq';
import { connection } from '../config/redis.js';
import logger from '../utils/logger.js';

export const orderQueue = new Queue('order-processing', {
    connection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 2000,
        },
        removeOnComplete: { age: 3600, count: 500 },
        removeOnFail: { age: 7 * 24 * 3600 },
    },
});

export const failedOrderQueue = new Queue('orders-failed', {
    connection,
    defaultJobOptions: {
        removeOnFail: { age: 30 * 24 * 3600 },
    },
});

export const enqueueOrder = async (tipo, data) => {
    const jobId = data.messageObject?.id
        || `directo-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    try {
        const job = await orderQueue.add(tipo, data, { jobId });
        logger.info(`[Queue] Job encolado: ${tipo} | jobId: ${jobId}`);
        return job;
    } catch (error) {
        if (error.message?.includes('already exists')) {
            logger.warn(`[Queue] Job duplicado ignorado: ${jobId}`);
            return null;
        }
        logger.error(`[Queue] Error al encolar job ${jobId}:`, error);
        throw error;
    }
};