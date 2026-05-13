// src/whatsapp/webhook.js
import express from 'express';
import Restaurante from '../models/Restaurante.js';
import { decrypt } from '../utils/cryptoUtils.js';
import { verificarDisponibilidad } from '../utils/dateUtils.js';
import { enqueueOrder } from '../queues/orderQueue.js';
import { sendMessage } from './utils.js';
import { sessionAdapter } from '../config/redis.js';
import logger from '../utils/logger.js';

const router = express.Router();

// ============================================================
// FIX: De-duplicación en Redis en lugar de Set en memoria.
// El Set moría al reiniciar el proceso — Meta reintentaba y
// los mensajes se procesaban doble. Con Redis sobrevive reinicios
// y funciona correctamente en entornos con múltiples procesos.
// TTL: 10 minutos (más que suficiente para el retry window de Meta)
// ============================================================
const MESSAGE_DEDUP_TTL = 600; // segundos

const isMessageAlreadySeen = async (messageId) => {
    const key = `dedup:msg:${messageId}`;
    try {
        const existing = await sessionAdapter.get(key);
        if (existing) return true;
        await sessionAdapter.set(key, '1', MESSAGE_DEDUP_TTL);
        return false;
    } catch {
        // Si Redis falla, permitimos el paso para no bloquear el flujo
        // El worker de BullMQ usa el messageId como jobId, así que 
        // la idempotencia a nivel de cola sigue funcionando.
        logger.warn('[Webhook] Redis no disponible para dedup — usando jobId de BullMQ como fallback');
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

        // Ignorar notificaciones de estado (leído, entregado)
        if (!messageObject) {
            return res.sendStatus(200);
        }

        // De-duplicación distribuida (Redis)
        const messageId = messageObject.id;
        const alreadySeen = await isMessageAlreadySeen(messageId);
        if (alreadySeen) {
            logger.warn(`[Webhook] Mensaje duplicado bloqueado: ${messageId}`);
            return res.sendStatus(200);
        }

        // Identificar restaurante (Multi-tenant)
        const phoneId = value.metadata.phone_number_id;
        const restaurante = await Restaurante.findOne({ whatsappPhoneId: phoneId }).lean();

        if (!restaurante) {
            logger.error(`[Webhook] Ningún restaurante coincide con Phone ID: ${phoneId}`);
            return res.sendStatus(200);
        }

        const businessId = restaurante._id.toString();
        const tokenReal = decrypt(restaurante.whatsappToken);
        const auth = { token: tokenReal, phoneId: restaurante.whatsappPhoneId };

        

        // Fast-path: negocio cerrado
        const disponibilidad = verificarDisponibilidad(restaurante);
        if (!disponibilidad.abierto) {
            await enviarTextoRapido(messageObject.from, disponibilidad.mensaje, auth);
            return res.sendStatus(200);
        }

        console.log("🚀 [Fast-Path] Encolando en Redis...");
        
        // Encolar en BullMQ (el jobId = messageId garantiza idempotencia adicional)
       await enqueueOrder('WHATSAPP', {
            userId: messageObject.from,
            messageObject, 
            messageId: messageObject.id, // 👈 VITAL para BullMQ
            businessId: restaurante._id.toString(),
            auth,
            restauranteConfig: restaurante.configuracion
        });

        res.sendStatus(200);

    } catch (error) {
        logger.error('[Webhook Critical Error]:', error);
        // Respondemos 500 para que Meta reintente (el dedup de Redis lo manejará)
        res.sendStatus(500);
    }
});

// GET para validación de Meta
// FIX: VERIFY_TOKEN viene SOLO de env. Sin fallback. 
// Si no está definido, la guardia de arranque en server.js ya habrá detenido el proceso.
router.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    //if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
    if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
        logger.info('[Webhook] Validado con éxito por Meta.');
        return res.status(200).send(challenge);
    }
    res.sendStatus(403);
});

export default router;
