// src/whatsapp/webhook.js - VERSIÓN FINAL ANTIFRAGIL CON IA Y CHECKOUT SEGURO

import { getUserSession, updateUserSession } from '../services/sessionService.js';
import { isBusinessOpen } from '../services/configService.js';
import { analizarPedidoConIA } from '../services/aiService.js'; 
import axios from 'axios';
import {
    enviarBienvenida,
    enviarMenuPrincipal,
    enviarCategoria,
    agregarAlCarrito,
    agregarItemsIAAlCarrito,
    enviarBotonFinalizar,
    enviarResumen,
    enviarConfirmacionFinal,
    enviarTexto,
    enviarMetodoPago // Se usa para preguntar por el pago
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

        // 🛑 1. INTERCEPTACIÓN DE HORARIOS 🛑
        const { open, message: closedMessage } = await isBusinessOpen(); 
        
        if (!open) {
            await enviarTexto(from, closedMessage);
            return res.sendStatus(200); 
        }
        // ------------------------------------

        const text = (message.text?.body || '').trim().toLowerCase();
        const isButton = message.interactive?.type === 'button_reply';
        const buttonId = isButton ? message.interactive.button_reply.id : null;

        let session = await getUserSession(from) || { step: 'start', cart: [], name: '', address: '', total: 0, paymentMethod: '' }; // Agregamos paymentMethod

        // --- MANEJO DEL CHECKOUT EN EL ORDEN CORRECTO ---

        // 6️⃣ PASO DEL NOMBRE (Captura el nombre)
        if (session.step === 'name' && text) {
            session.name = message.text.body.trim();
            await enviarTexto(from, `Perfecto *${session.name}*!\n\nDirección de entrega (calle, número, colonia):`);
            session.step = 'address';
            await updateUserSession(from, session);
            return res.sendStatus(200);
        }

        // 7️⃣ PASO DE LA DIRECCIÓN (Captura la dirección)
        else if (session.step === 'address' && text) {
            session.address = message.text.body.trim();
            
            // Pide el método de pago
            await enviarMetodoPago(from, session); 
            session.step = 'awaiting_payment'; 
            
            await updateUserSession(from, session);
            return res.sendStatus(200);
        }

        // 7.5️⃣ PASO DEL PAGO (Captura la opción del cliente)
        else if (session.step === 'awaiting_payment' && (isButton || text)) {
            
            let metodoPago = '';
            
            // Manejo de botones interactivos
            if (isButton) {
                if (buttonId === 'PAY_CASH') {
                    metodoPago = 'Efectivo';
                } else if (buttonId === 'PAY_CARD') {
                    metodoPago = 'Tarjeta';
                } else if (buttonId === 'PAY_TRANSFER') { 
                    metodoPago = 'Transferencia';
            } 
            }
            
            // Manejo de texto libre (si no fue botón)
            if (!metodoPago && text) {
                if (text.includes('efectivo')) {
                    metodoPago = 'Efectivo';
                } else if (text.includes('tarjeta')) {
                    metodoPago = 'Tarjeta';
                } else if (text.includes('transferencia')) {
                    metodoPago = 'Transferencia';
                }
            }
            
            if (!metodoPago) {
                await enviarTexto(from, "Por favor, elige *Efectivo* o *Tarjeta* para continuar.");
                return res.sendStatus(200);
            }
            
            session.paymentMethod = metodoPago; 
            
            // Ahora que tenemos el método, vamos a la confirmación final
            await enviarConfirmacionFinal(from, session); 
            
            return res.sendStatus(200);
        }

        // 2️⃣ MANEJO DE CHECKOUT, FINALIZAR Y ESTADO DEL PEDIDO (Comandos de texto y botón)
        const comandoCheckout = buttonId === 'FINALIZAR' || text.includes('finalizar') || text.includes('mi pedido') || text.includes('donde esta');

        if (comandoCheckout) {
            if (session.cart.length === 0) {
                await enviarTexto(from, "Tu carrito está vacío. Escribe *hola* o *menú* para comenzar.");
                return res.sendStatus(200);
            }
            
            // 🛑 LÓGICA DE VALIDACIÓN: Fuerza el flujo de datos 🛑
            
            // 1. Si falta el nombre, iniciamos/continuamos pidiendo el nombre
            if (!session.name) { 
                session.step = 'name'; 
                await enviarResumen(from, session); 
                await updateUserSession(from, session);
                return res.sendStatus(200);
            }
            
            // 2. Si tenemos nombre pero falta la dirección
            if (session.name && !session.address) {
                session.step = 'address'; 
                await enviarTexto(from, `¡Hola, ${session.name}! Por favor, dinos tu dirección de entrega.`);
                await updateUserSession(from, session);
                return res.sendStatus(200);
            }

            // 3. Si tenemos nombre y dirección, pero falta el pago (si el usuario regresa)
            if (session.name && session.address && !session.paymentMethod) {
                session.step = 'awaiting_payment';
                 await enviarMetodoPago(from, session);
                 await updateUserSession(from, session);
                 return res.sendStatus(200);
            }
            
            // 4. Si ya tenemos todo, confirmamos
            if (session.name && session.address && session.paymentMethod) {
                 await enviarConfirmacionFinal(from, session); 
                 return res.sendStatus(200);
            }
        }

        // 3️⃣ INICIO NORMAL (TEXTO)
        // ⬅️ CRÍTICO: CAMBIAR IF POR ELSE IF para que el flujo no se rompa
        else if (text.includes('hola') || text.includes('menu') || session.step === 'start') {
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
            session.step = 'items';
        }
        else if (buttonId?.startsWith('ADD_')) {
            await agregarAlCarrito(from, buttonId.replace('ADD_', ''), session);
        }
        // 5️⃣ LÓGICA DE IA PARA PEDIDOS EN TEXTO LIBRE
        else if (text && session.step !== 'name' && session.step !== 'address' && session.step !== 'awaiting_payment' && !isButton) {
            
            logger.info(`Analizando texto libre con IA: ${text}`);
            const itemsAñadir = await analizarPedidoConIA(text);

            if (itemsAñadir.length > 0) {
                const added = await agregarItemsIAAlCarrito(from, itemsAñadir, session);
                
                if (added.length > 0) {
                    await updateUserSession(from, session);
                    return res.sendStatus(200);
                }
            } 
            
            // Si la IA no encontró nada, o el mensaje no fue entendido, cae al mensaje por defecto.
            await enviarTexto(from, "Continuamos con tu pedido. ¿Algo más?\n\nEscribe *finalizar* para ir al resumen o *menú* para ver las opciones.");
        }
        
        // 8️⃣ CUALQUIER OTRA COSA (default)
        else {
            await enviarTexto(from, "Disculpa, no entendí. Escribe *menú* o *finalizar*.");
        }

        await updateUserSession(from, session);
        res.sendStatus(200);

    } catch (error) {
        logger.error('Error en webhook:', error);
        res.sendStatus(500);
    }
};