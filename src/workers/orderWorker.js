// src/workers/orderWorker.js

import { Worker } from "bullmq";

import Restaurante from "../models/Restaurante.js";

import { connection } from "../config/redis.js";

// ==========================================
// SERVICES
// ==========================================

import { handleInteractiveMessage } from "../services/conversation/handleInteractiveMessage.js";

import { handleTextMessage } from "../services/conversation/handleTextMessage.js";

import { handleLocationMessage } from "../services/conversation/handleLocationMessage.js";

import { handleImageMessage } from "../services/conversation/handleImageMessage.js";

import { processDirectOrder } from "../services/directOrderService.js";

// ==========================================
// CART
// ==========================================

import { getOrCreateCart } from "../whatsapp/cartUtils.js";

import logger from "../utils/logger.js";

logger.info("[Worker] Orquestador SaaS iniciado y escuchando...");

// ==========================================
// WORKER
// ==========================================

const orderWorker = new Worker(
  "order-processing",

  async (job) => {
    const source = job.name;

    const { businessId, auth, userId, messageObject, restauranteConfig } =
      job.data;

    logger.info(
      `[Worker] Tarea recibida: ${source} | ID: ${job.id} | Tipo: ${messageObject?.type}`,
    );

    try {
      // ==========================================
      // WHATSAPP
      // ==========================================

      if (source === "WHATSAPP") {
        const restaurante = await Restaurante.findById(businessId).lean();

        const cart = await getOrCreateCart(userId, businessId);

        // ==========================================
        // INTERACTIVE
        // ==========================================

        if (messageObject.type === "interactive") {
          return await handleInteractiveMessage({
            userId,
            businessId,
            auth,
            cart,
            restaurante,
            messageObject,
          });
        }

        // ==========================================
        // LOCATION
        // ==========================================

        if (messageObject.type === "location") {
          return await handleLocationMessage({
            userId,
            businessId,
            auth,
            cart,
            restaurante,
            messageObject,
          });
        }

        // ==========================================
        // IMAGE
        // ==========================================

        if (messageObject.type === "image") {
          return await handleImageMessage({
            userId,
            businessId,
            auth,
            cart,
            restaurante,
            messageObject,
          });
        }

        // ==========================================
        // TEXT
        // ==========================================

        return await handleTextMessage({
          userId,
          businessId,
          auth,
          cart,
          restaurante,
          restauranteConfig,
          messageObject,
        });
      }

      // ==========================================
      // DIRECTO
      // ==========================================

      if (source === "DIRECTO") {
        return await processDirectOrder(job.data);
      }
    } catch (e) {
      logger.error("[Worker Error] ❌ Fallo crítico:", e);
    }
  },

  { connection },
);

orderWorker.on("completed", (job) => {
  logger.info(`[Worker] ✅ Tarea completada: ${job.id}`);
});

export default orderWorker;
