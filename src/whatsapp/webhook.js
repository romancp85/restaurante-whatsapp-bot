// src/whatsapp/webhook.js
import express from 'express';
import Restaurante from '../models/Restaurante.js';
import { decrypt } from '../utils/cryptoUtils.js';
import { verificarDisponibilidad } from '../utils/dateUtils.js';
import { enqueueOrder } from '../queues/orderQueue.js';
import { sendMessage } from './utils.js';
import { sessionAdapter } from '../config/redis.js';
import { checkRateLimit } from '../services/securityService.js';
import logger from '../utils/logger.js';

const router = express.Router();
const MESSAGE_DEDUP_TTL = 600; 

/**
 * 🛡️ EVITAR DUPLICADOS (Idempotencia en Redis)
 */
const isMessageAlreadySeen = async (messageId) => {
    const key = `dedup:msg:${messageId}`;
    try {
        const existing = await sessionAdapter.get(key);
        if (existing) return true;
        await sessionAdapter.set(key, '1', MESSAGE_DEDUP_TTL);
        return false;
    } catch {
        logger.warn('[Webhook] Fallo en dedup — permitiendo paso.');
        return false;
    }
};

const enviarTextoRapido = async (userId, texto, auth) => {
    await sendMessage(userId, { type: 'text', text: { body: texto } }, auth);
};

router.post('/webhook', async (req, res) => {
    try {
        const value = req.body.entry?.[0]?.changes?.[0]?.value;
        const messageObject = value?.messages?.[0];

        // 1. Filtrar eventos que no sean mensajes (leídos, entregados, etc.)
        if (!messageObject) return res.sendStatus(200);

        // 2. De-duplicación (Idempotencia)
        const messageId = messageObject.id;
        if (await isMessageAlreadySeen(messageId)) {
            logger.info(`[Webhook] ⚠️ Mensaje duplicado ignorado: ${messageId}`);
            return res.sendStatus(200);
        }

        // 3. Identificar Restaurante (Multi-tenant)
        const phoneId = value.metadata.phone_number_id;
        const restaurante = await Restaurante.findOne({ whatsappPhoneId: phoneId }).lean();

        if (!restaurante) {
            logger.error(`[Webhook Error] Negocio no registrado para ID: ${phoneId}`);
            return res.sendStatus(200);
        }

        const businessId = restaurante._id.toString();

        // 4. Rate Limiting (Protección anti-spam y económica)
        const rateCheck = await checkRateLimit(messageObject.from, businessId);
        if (!rateCheck.allowed) {
            logger.warn(`🚫 [Webhook] Bloqueado por Rate Limit: ${messageObject.from}`);
            return res.sendStatus(200);
        }

        const tokenReal = decrypt(restaurante.whatsappToken);
        const auth = { token: tokenReal, phoneId: restaurante.whatsappPhoneId };

        // 5. Disponibilidad de Horario (Fast-Path)
        const disponibilidad = verificarDisponibilidad(restaurante);
        if (!disponibilidad.abierto) {
            await enviarTextoRapido(messageObject.from, disponibilidad.mensaje, auth);
            return res.sendStatus(200);
        }

        // 🌟 6. SENSOR DE TIPO DE MENSAJE (Nivel Top-Tier)
        const msgType = messageObject.type;
        logger.info(`[Webhook] 📥 Nuevo evento de tipo [${msgType.toUpperCase()}] de ${messageObject.from}`);

        /**
         * Nota de Arquitecto: 
         * Aunque el Worker procesa todo, el nombre del Job ('WHATSAPP') se mantiene 
         * para asegurar el bloqueo por usuario (User Locking) en BullMQ.
         */
        
        await enqueueOrder('WHATSAPP', {
            userId: messageObject.from,
            messageObject, 
            messageId, 
            businessId,
            auth,
            restauranteConfig: restaurante.configuracion
        });

        res.sendStatus(200);

    } catch (error) {
        logger.error('[Webhook Critical Error]:', { message: error.message });
        res.sendStatus(500);
    }
});

// Validación de Webhook para Meta (Handshake)
router.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
        logger.info('[Webhook] Handshake exitoso.');
        return res.status(200).send(challenge);
    }
    res.sendStatus(403);
});

export default router;