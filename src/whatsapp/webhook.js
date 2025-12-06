// src/whatsapp/webhook.js - VERSIÓN FINAL ANTIFRAGIL CON IA

import { getUserSession, updateUserSession } from '../services/sessionService.js';
import { isBusinessOpen } from '../services/configService.js';
import { analizarPedidoConIA } from '../services/aiService.js'; // ⬅️ NUEVA IMPORTACIÓN DE IA
import axios from 'axios';
import {
    enviarBienvenida,
    enviarMenuPrincipal,
    enviarCategoria,
    agregarAlCarrito,
    agregarItemsIAAlCarrito, // ⬅️ NUEVA FUNCIÓN PARA PROCESAR EL JSON DE LA IA
    enviarBotonFinalizar,
    enviarResumen,
    enviarConfirmacionFinal,
    enviarTexto
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
            await enviarTexto(from, closedMessage);
            return res.sendStatus(200); 
        }
        // ------------------------------------------------------------------

        const text = (message.text?.body || '').trim().toLowerCase();
        const isButton = message.interactive?.type === 'button_reply';
        const buttonId = isButton ? message.interactive.button_reply.id : null;

        let session = await getUserSession(from) || { step: 'start', cart: [], name: '', address: '', total: 0 };

        // 2️⃣ PREGUNTA POR SU PEDIDO EN CUALQUIER MOMENTO
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

        // 3️⃣ INICIO NORMAL (TEXTO)
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
        
        // 5️⃣ LÓGICA DE IA PARA PEDIDOS EN TEXTO LIBRE
        else if (text && session.step !== 'name' && session.step !== 'address' && !isButton) {
            
            logger.info(`Analizando texto libre con IA: ${text}`);
            const itemsAñadir = await analizarPedidoConIA(text);

            if (itemsAñadir.length > 0) {
                // El handler mejorado se encarga de añadir y notificar al usuario
                const added = await agregarItemsIAAlCarrito(from, itemsAñadir, session);
                // Si se añadió algo, el handler ya notificó, solo hacemos return.
                if (added.length > 0) {
                    await updateUserSession(from, session);
                    return res.sendStatus(200);
                }
            } 
            
            // Si la IA no encontró nada O si el handler no pudo añadir nada, cae al mensaje por defecto.
            await enviarTexto(from, "Continuamos con tu pedido. ¿Algo más?\n\nEscribe *dónde está mi pedido* para ver el resumen o *menú* para ver las opciones.");
        }


        // 6️⃣ PASO DEL NOMBRE (blindado)
        else if (session.step === 'name' && text) {
            session.name = message.text.body.trim();
            await enviarTexto(from, `Perfecto *${session.name}*!\n\nDirección de entrega (calle, número, colonia):`);
            session.step = 'address';
        }

        // 7️⃣ PASO DE LA DIRECCIÓN (blindado)
        else if (session.step === 'address' && text) {
            session.address = message.text.body.trim();
            await enviarConfirmacionFinal(from, session);
            // IMPORTANTE: Si vas a guardar el pedido aquí, ¡debes hacerlo antes de resetear la sesión!
            session = { step: 'start', cart: [] }; // reset después de confirmar
        }
        
        // 8️⃣ CUALQUIER OTRA COSA (incluye mensajes sin texto en un paso sin interacción)
        else {
             await enviarTexto(from, "Continuamos con tu pedido. ¿Algo más?\n\nEscribe *dónde está mi pedido* para ver el resumen o *menú* para ver las opciones.");
        }

        await updateUserSession(from, session);
        res.sendStatus(200);

    } catch (error) {
        logger.error('Error en webhook:', error);
        res.sendStatus(500);
    }
};