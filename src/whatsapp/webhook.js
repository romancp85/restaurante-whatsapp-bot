// src/whatsapp/webhook.js - FINAL CON GESTIÓN DE ESTADO Y PAGO INTERACTIVO (CON ESCAPE DE PAGO)

import logger from '../utils/logger.js';
import { isBusinessOpen } from '../services/configService.js'; 
import { getOrCreateCart, updateCart, addItemToCart } from './cartUtils.js'; 
import { sendMessage, sendMenu, sendCartSummary, sendPaymentMethodOptions } from './utils.js'; 
import { processFinalOrder } from './orderProcessor.js'; 
import { analizarPedidoConIA } from '../services/aiService.js'; 

// Mantener verifyWebhook sin cambios
export const verifyWebhook = (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode && token && mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
        return res.send(challenge);
    }
    res.sendStatus(403);
};


// -------------------------------------------------------------
// Lógica Principal de Manejo de Mensajes
// -------------------------------------------------------------
export const receiveMessage = async (req, res) => {
    try {
        const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
        if (!message) return res.sendStatus(200);

        const from = message.from;
        const text = (message.text?.body || '').trim().toLowerCase();
        
        // 1. Interceptación de Horarios
        const { open, message: closedMessage } = await isBusinessOpen(); 
        if (!open) {
            await sendMessage(from, closedMessage);
            return res.sendStatus(200); 
        }

        // 2. Obtener/Crear el carrito de compras
        let cart = await getOrCreateCart(from);
        
        // 🛑 NUEVO CHECK: Manejo de Error de Persistencia 🛑
        if (cart.conversationState === 'ERROR') {
        await sendMessage(from, "⚠️ Lo sentimos, tenemos problemas técnicos y no podemos procesar pedidos ahora mismo. Por favor, inténtalo más tarde.");
    
        // [FUTURO]: Llamar a una función de alerta a gerencia: (Error de DB)
    
        return res.sendStatus(200);
    }
    // --------------------------------------------------
        
        // 3. Manejo de botones interactivos y respuesta rápida
        let buttonId = null;
        if (message.interactive?.type === 'button_reply') {
            buttonId = message.interactive.button_reply.id;
        } else if (message.type === 'button') {
             buttonId = message.button.payload;
        }

        // 4. Procesamiento de comandos globales (siempre accesibles)
        
        // COMANDOS DE FLUJO
        if (text === 'menú' || text === 'menu' || text === 'hola') {
            await sendMenu(from); 
            return res.sendStatus(200); 
        }
        
        if (text === 'carrito' || text === 'ver carrito') {
            await sendCartSummary(from, cart);
            return res.sendStatus(200);
        }
        
        if (text.startsWith('quitar') && cart.items.length > 0) {
            const parts = text.split(' ');
            const itemIndex = parseInt(parts[1]) - 1; 

            if (!isNaN(itemIndex) && itemIndex >= 0 && itemIndex < cart.items.length) {
                const [removedItem] = cart.items.splice(itemIndex, 1);
                await updateCart(from, { items: cart.items, conversationState: 'EN_CARRITO' });
                await sendMessage(from, `❌ "${removedItem.nombre}" eliminado. ${cart.items.length > 0 ? 'Responde *CARRITO* para ver el resumen.' : 'Tu carrito está vacío. Escribe *MENÚ* para empezar.'}`);
            } else {
                 await sendMessage(from, "Usa el formato: *QUITAR [número de ítem]* (ej: QUITAR 1).");
            }
            return res.sendStatus(200);
        }
        
        // COMANDO FINALIZAR/CONFIRMAR - INICIA EL FLUJO DE CHECKOUT
        if ((text === 'finalizar' || text === 'confirmar') && cart.conversationState !== 'CONFIRMANDO_PEDIDO') {
            if (cart.items.length === 0) {
                await sendMessage(from, "Tu carrito está vacío. Escribe *menú* para comenzar.");
                return res.sendStatus(200);
            }
            
            await sendMessage(from, "Perfecto! ¿Cuál es tu nombre para el pedido?");
            await updateCart(from, { conversationState: 'PREGUNTANDO_NOMBRE' });
            return res.sendStatus(200);
        }
        
        // COMANDO HANDOFF: Permite al cliente pedir ayuda humana.
        if (text === 'ayuda' || text === 'hablar con humano' || text === 'agente') {
            if (cart.conversationState === 'ESPERANDO_AGENTE') {
        await sendMessage(from, "Un agente ya fue notificado. Por favor, espera unos minutos.");
        return res.sendStatus(200);
        }
    
    // 🛑 CAMBIAR EL ESTADO 🛑
    await updateCart(from, { conversationState: 'ESPERANDO_AGENTE' });
    
    await sendMessage(from, "Entendido. He notificado a un agente de servicio al cliente. En breve te responderemos. Por favor, sé paciente.");
    // [FUTURO]: Llamar a la función que notifica al equipo interno (Slack/Email)
    
    // 🛑 NO EJECUTAR EL SWITCH 🛑
    return res.sendStatus(200);
}

        // 5. SWITCH PRINCIPAL basado en el Estado de la Conversación
        switch (cart.conversationState) {
            
            case 'INICIO':
            case 'EMPEZAR':
                await sendMenu(from);
                break;

            case 'MOSTRANDO_MENU':
                const selectedIndex = parseInt(text);
                const menuMap = cart.tempData?.menuMap;

                if (!isNaN(selectedIndex) && menuMap && selectedIndex > 0 && selectedIndex <= menuMap.length) {
                    const selectedItem = menuMap[selectedIndex - 1];
                    cart.tempData = { itemId: selectedItem.itemId, nombre: selectedItem.nombre };
                    
                    await sendMessage(from, `¡Excelente! Has seleccionado *${selectedItem.nombre}*.\n\n¿Cuántas unidades deseas? (Responde con un número, ej: *2*)`);
                    await updateCart(from, { tempData: cart.tempData, conversationState: 'PREGUNTANDO_CANTIDAD' });
                } else {
                    await handleAICheck(from, text, cart);
                }
                break;

            case 'PREGUNTANDO_CANTIDAD':
                const quantity = parseInt(text);
                const itemId = cart.tempData?.itemId;

                if (isNaN(quantity) || quantity <= 0) {
                    await sendMessage(from, "Por favor, ingresa una cantidad válida (ej: *1* o *3*).");
                } else if (itemId) {
                    await addItemToCart(cart, itemId, quantity); 
                    await sendMessage(from, `✅ Se agregaron ${quantity} unidad(es) de ${cart.tempData.nombre} al carrito.\n\nEscribe *MENÚ* para agregar más o *CARRITO* para finalizar.`);
                    
                    await updateCart(from, { tempData: {}, conversationState: 'EN_CARRITO' });
                } else {
                     await sendMessage(from, "Hubo un error. Escribe *MENÚ* para volver a empezar.");
                }
                break;
                
            case 'PREGUNTANDO_NOMBRE': 
                if (message.text?.body) { 
                    cart.tempData.name = message.text.body.trim();
                    
                    await sendMessage(from, `Gracias *${cart.tempData.name}*!\n\nPor favor, dinos tu *dirección de entrega* completa (calle, número, colonia/barrio y referencias):`);
                    await updateCart(from, { tempData: cart.tempData, conversationState: 'PREGUNTANDO_DIRECCION' });
                } else {
                    await sendMessage(from, "Por favor, escribe tu nombre para continuar.");
                }
                break;

            case 'PREGUNTANDO_DIRECCION': 
                if (message.text?.body) { 
                    cart.tempData.address = message.text.body.trim();
                    
                    await sendPaymentMethodOptions(from);
                    
                    await updateCart(from, { tempData: cart.tempData, conversationState: 'PREGUNTANDO_PAGO' }); 
                } else {
                     await sendMessage(from, "Por favor, escribe tu dirección completa para el envío.");
                }
                break;
                
            case 'PREGUNTANDO_PAGO': 
                if (buttonId && buttonId.startsWith('PAYMENT_')) {
                    
                    const method = buttonId.replace('PAYMENT_', '').replace(/_/g, ' '); 
                    
                    // Conversión a Title Case para coincidir con el ENUM de Pedido.js
                    const formattedMethod = method.charAt(0).toUpperCase() + method.slice(1).toLowerCase();
                    
                    cart.tempData.paymentMethod = formattedMethod; 
                    
                    await sendMessage(from, `Elegiste *${formattedMethod}*. Responde *CONFIRMAR* para enviar tu pedido.`);
                    
                    await updateCart(from, { tempData: cart.tempData, conversationState: 'CONFIRMANDO_PEDIDO' });
                } else {
                    await sendMessage(from, "Por favor, selecciona una de las opciones de pago con los botones.");
                }
                break;
                
            case 'CONFIRMANDO_PEDIDO':
                // 🛑 NUEVA LÓGICA: PERMITIR CAMBIAR EL PAGO 🛑
                if (text === 'cambiar pago' || text === 'pago') {
                    await sendPaymentMethodOptions(from);
                    await updateCart(from, { conversationState: 'PREGUNTANDO_PAGO' }); // Regresa al estado de pago
                    return res.sendStatus(200);
                }

                if (text === 'si' || text === 'confirmar' || text === 'enviar') {
                    await processFinalOrder(cart); 
                } else {
                    // Actualizamos el mensaje de ayuda para incluir la nueva opción
                    await sendMessage(from, "Por favor, escribe *CONFIRMAR* para enviar tu pedido, *CARRITO* para verlo, *MENÚ* para volver y modificarlo o *CAMBIAR PAGO*.");
                }
                break;

            case 'EN_CARRITO':
                await handleAICheck(from, text, cart);
                break;
                
            default:
                logger.warn(`Estado no reconocido para ${from}: ${cart.conversationState}`);
                await sendMessage(from, "Disculpa, algo no está claro. Escribe *MENÚ* para reiniciar el pedido.");
                await updateCart(from, { conversationState: 'INICIO' });
                break;
        }

        return res.sendStatus(200);

    } catch (error) {
        logger.error('Error catastrófico en receiveMessage:', error);
        res.sendStatus(500);
    }
};


// -------------------------------------------------------------
// Función Auxiliar para manejar la Lógica de IA
// -------------------------------------------------------------

async function handleAICheck(from, text, cart) {
    if (text) {
        logger.info(`Analizando texto libre con IA: ${text}`);
        
        const itemsAñadir = await analizarPedidoConIA(text); 

        if (itemsAñadir && itemsAñadir.length > 0) {
            let addedCount = 0;
            for (const item of itemsAñadir) {
                const resultCart = await addItemToCart(cart, item.itemId, item.quantity, item.notes);
                if (resultCart) addedCount++;
            }

            if (addedCount > 0) {
                await updateCart(from, { conversationState: 'EN_CARRITO' });
                await sendMessage(from, `🤖 Entendido! He añadido ${addedCount} productos a tu carrito. Escribe *CARRITO* para revisar o *MENÚ* para seguir agregando.`);
                return;
            }
        } 
        
        await sendMessage(from, "Disculpa, no entendí. Escribe *MENÚ* o *FINALIZAR*.");
    }
}