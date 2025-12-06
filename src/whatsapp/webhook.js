// src/whatsapp/webhook.js - CÓDIGO FINAL CORREGIDO Y ANTIFRÁGIL

import { getUserSession, updateUserSession } from '../services/sessionService.js';
import { isBusinessOpen } from '../services/configService.js'; // ⬅️ IMPORTACIÓN DE HORARIOS
import axios from 'axios';
import {
    enviarBienvenida,
    enviarMenuPrincipal,
    enviarCategoria,
    agregarAlCarrito,
    enviarBotonFinalizar,
    enviarResumen,
    enviarConfirmacionFinal,
    enviarTexto // Necesaria para enviar el mensaje de "Cerrado"
} from '../handlers/flowHandler.js';
import logger from '../utils/logger.js';

const TOKEN = process.env.WHATSAPP_TOKEN?.trim();
const PHONE_ID = process.env.WHATSAPP_PHONE_ID;

export const verifyWebhook = (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode && token && mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
        return res.send(challenge);
    }
    res.sendStatus(403);
};

export const receiveMessage = async (req, res) => {
    try {
        const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
        if (!message) return res.sendStatus(200);

        const from = message.from;
        
        // 🛑 1. INTERCEPTACIÓN DE HORARIOS (POSICIÓN CRÍTICA) 🛑
        const { open, message: closedMessage } = await isBusinessOpen(); 
        
        if (!open) {
            // Si está cerrado, envía el mensaje de cerrado y termina toda la ejecución.
            await enviarTexto(from, closedMessage);
            return res.sendStatus(200); 
        }
        // ------------------------------------------------------------------

        // Ahora procedemos solo si está abierto
        const text = (message.text?.body || '').trim().toLowerCase();
        const isButton = message.interactive?.type === 'button_reply';
        const buttonId = isButton ? message.interactive.button_reply.id : null;

        let session = await getUserSession(from) || { step: 'start', cart: [], name: '', address: '', total: 0 };

        // 2️⃣ PREGUNTA POR SU PEDIDO EN CUALQUIER MOMENTO (Ahora es el primer IF)
        if (text.includes('donde esta') || text.includes('mi pedido') || text.includes('cuando llega') || text.includes('estado') || text.includes('pedido')) {
            if (session.cart.length > 0) {
                const lista = session.cart.map(p => `${p.cantidad || 1}x ${p.nombre}`).join('\n');
                await enviarTexto(from, `*Tu pedido actual:*\n${lista}\n\nTotal: $${session.total || 'calculando...'}\n\nNombre: ${session.name || 'no dicho'}\nDirección: ${session.address || 'no dicha'}\n\nEn cuanto vea el pago, sale en 15-25 min`);
            } else {
                await enviarTexto(from, 'Aún no tienes pedido activo. Escribe *hola* para comenzar');
            }
            await updateUserSession(from, session);
            return res.sendStatus(200);
        }

        // 3️⃣ INICIO NORMAL
        if (text.includes('hola') || text.includes('menu') || session.step === 'start') {
            await enviarBienvenida(from);
            session.step = 'menu';
        }
        // 4️⃣ BOTONES DEL MENÚ
        else if (buttonId === 'VER_MENU') {
            await enviarMenuPrincipal(from);
            session.step = 'category';
        }
        else if (buttonId?.startsWith('CAT_')) {
            const cat = buttonId.replace('CAT_', '').toLowerCase();
            await enviarCategoria(from, cat, 0);
            session.step = 'items';
        }
        else if (buttonId?.startsWith('PAGE_')) {
            const [, cat, page] = buttonId.split('_');
            await enviarCategoria(from, cat.toLowerCase(), Number(page));
        }
        else if (buttonId?.startsWith('ADD_')) {
            await agregarAlCarrito(from, buttonId.replace('ADD_', ''), session);
        }
        else if (buttonId === 'FINALIZAR') {
            if (session.cart.length === 0) {
                await enviarTexto(from, "Tu carrito está vacío");
            } else {
                await enviarResumen(from, session);
                session.step = 'name';
            }
        }

        // 5️⃣ PASO DEL NOMBRE (ahora es blindado)
        else if (session.step === 'name') {
            session.name = message.text.body.trim();
            await enviarTexto(from, `Perfecto *${session.name}*!\n\nDirección de entrega (calle, número, colonia):`);
            session.step = 'address';
        }

        // 6️⃣ PASO DE LA DIRECCIÓN (blindado también)
        else if (session.step === 'address') {
            session.address = message.text.body.trim();
            await enviarConfirmacionFinal(from, session);
            session = { step: 'start', cart: [] }; // reset después de confirmar
        }

        // 7️⃣ CUALQUIER OTRA COSA → no pierde el carrito
        else {
            await enviarTexto(from, "Continuamos con tu pedido. ¿Algo más?\n\nEscribe *dónde está mi pedido* para ver el resumen");
        }

        await updateUserSession(from, session);
        res.sendStatus(200);

    } catch (error) {
        logger.error('Error en webhook:', error);
        res.sendStatus(500);
    }
};