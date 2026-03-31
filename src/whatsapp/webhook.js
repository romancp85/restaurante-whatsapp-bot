// src/whatsapp/webhook.js - VERSIÓN COMPLETA ORIGINAL (300+ LÍNEAS) - REPARADA
import express from 'express';
import { getOrCreateCart, updateCart, addItemToCart, removeItemFromCart } from './cartUtils.js'; 
import { sendMessage, sendMenu, sendCartSummary, sendPaymentMethodOptions } from './utils.js';
import { getGlobalConfig } from '../services/configServiceDB.js'; 
import { processFinalOrder } from './orderProcessor.js';
import { analizarPedidoConIA } from '../utils/aiUtils.js'; 
import logger from '../utils/logger.js';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN; 

// ----------------------------------------------------------------------
// FUNCIONES AUXILIARES PARA MENSAJES
// ----------------------------------------------------------------------

const enviarTexto = async (userId, texto) => {
    await sendMessage(userId, { type: "text", text: { body: texto } });
};

/**
 * Procesa el mensaje de un cliente en función del estado de la conversación.
 */
async function handleStateFlow(userId, text, cart) {
    const currentState = cart.conversationState;

    switch (currentState) {
        
        case 'INICIO':
        case 'EMPEZAR':
            await sendMenu(userId);
            break;

        case 'MOSTRANDO_MENU':
            const menuSelection = parseInt(text);
            const selectedItem = cart.tempData.menuMap?.find(item => item.index === menuSelection);

            if (selectedItem) {
                cart.tempData.currentItemId = selectedItem.itemId;
                cart.tempData.itemName = selectedItem.nombre;
                await updateCart(userId, { tempData: cart.tempData, conversationState: 'PREGUNTANDO_CANTIDAD' });
                await enviarTexto(userId, `¿Cuántas unidades de *${selectedItem.nombre}* deseas? (Solo el número)`);
            } else {
                // 🛑 CAMBIO AQUÍ: Si no es un número del menú, intentamos con IA
                // En lugar de enviar el error aquí, dejamos que el flujo continúe hacia handleAICheck
                return "TRY_AI"; 
            }
            break;
        
        case 'PREGUNTANDO_CANTIDAD':
            const quantity = parseInt(text);
            if (quantity > 0 && cart.tempData.currentItemId) {
                const itemId = cart.tempData.currentItemId;
                // LLAMADA CRÍTICA: Se envía userId para mantener el carrito correcto
                const result = await addItemToCart(userId, cart, itemId, quantity);
                
                if (result.success) {
                    cart.tempData = {};
                    await updateCart(userId, { tempData: {}, conversationState: 'EN_CARRITO' });
                    await enviarTexto(userId, `¡Añadido! *${result.name}* (x${quantity}). Escribe *CARRITO* para revisar o *MENÚ* para seguir agregando.`);
                } else {
                    // Mantenemos tus validaciones de stock originales
                    let errorMsg = "No pudimos añadir el producto.";
                    if (result.reason === 'SIN_STOCK') {
                        errorMsg = `❌ *${result.name}*: Solo quedan ${result.available || 0} unidades disponibles. No se añadió.`;
                    } else if (result.reason === 'NO_DISPONIBLE') {
                        errorMsg = `❌ *${result.name}*: Está agotado por hoy.`;
                    } else if (result.reason === 'INACTIVO') {
                        errorMsg = `❌ *${result.name}*: Ya no está en nuestro menú.`;
                    }
                    await enviarTexto(userId, errorMsg);
                }
            } else {
                await enviarTexto(userId, "Por favor, ingresa una cantidad válida (solo números).");
            }
            break;

        case 'EN_CARRITO':
            await enviarTexto(userId, "Escribe *MENÚ* para agregar más productos o *FINALIZAR* para continuar.");
            break;

        case 'PREGUNTANDO_NOMBRE':
            const nombre = text.trim();
            if (nombre.length < 3) {
                await enviarTexto(userId, "Por favor, escribe tu nombre completo para el pedido.");
            } else {
                cart.tempData.name = nombre;
                await updateCart(userId, { tempData: cart.tempData, conversationState: 'PREGUNTANDO_DIRECCION' });
                await enviarTexto(userId, `¡Genial, ${nombre}! ¿Cuál es la *dirección completa* para la entrega?`);
            }
            break;

            // Si el usuario escribió algo como "ya la tienes", 
            // y efectivamente YA HAY una dirección en el carrito...
            if (cart.tempData.address && cart.tempData.address.length > 5) {
            await updateCart(userId, { conversationState: 'PREGUNTANDO_PAGO' });
            return await sendPaymentMethods(userId); // Saltamos al pago
    }
    
            // Si no la tiene, entonces sí guardamos lo que escribió el usuario
            await updateCart(userId, { 
            tempData: { ...cart.tempData, address: text }, 
            conversationState: 'PREGUNTANDO_PAGO' 

    });
            await sendPaymentMethods(userId);
            break;

        case 'PREGUNTANDO_DIRECCION':
            const entradaDireccion = text.trim();
            // 🛡️ Si ya tenemos dirección y el usuario dice "ya la tienes" o algo corto
            if (cart.tempData.address && (entradaDireccion.toLowerCase().includes("ya") || entradaDireccion.length < 5)) {
                await updateCart(userId, { conversationState: 'PREGUNTANDO_PAGO' });
                return await sendPaymentMethodOptions(userId); 
            }
            
            // Si no la tenemos, guardamos lo que escribió
            cart.tempData.address = entradaDireccion;
            await updateCart(userId, { 
                tempData: cart.tempData, 
                conversationState: 'PREGUNTANDO_PAGO' 
            });
            await sendPaymentMethodOptions(userId);
            break;

        case 'PREGUNTANDO_PAGO':
            await sendPaymentMethodOptions(userId);
            await enviarTexto(userId, "Por favor, selecciona una opción con los botones.");
            break;
            
        case 'CONFIRMANDO_PEDIDO':
            await enviarTexto(userId, "Por favor, escribe *CONFIRMAR* para procesar tu pedido o *CARRITO* para revisar antes de finalizar.");
            break;
        
        case 'ESPERANDO_AGENTE':
            logger.info(`Cliente ${userId} en Handoff. Ignorando mensaje.`);
            break;

        default:
            await sendMenu(userId);
            break;
    }
}

/**
 * handleAICheck optimizada para asegurar que el carrito se actualice en la DB.
 */
async function handleAICheck(userId, text, cart) {
    try {
        if (!text) return "NO_ITEMS";

        const aiResponse = await analizarPedidoConIA(text); 
        const itemsAñadir = (aiResponse && Array.isArray(aiResponse.items)) ? aiResponse.items : [];
        const clienteInfo = aiResponse?.clienteInfo || {}; 

        if (itemsAñadir.length === 0) return "NO_ITEMS";
        
        // 1. Obtener carrito actual
        const currentCart = await getOrCreateCart(userId);
        
        const results = [];
        for (const item of itemsAñadir) {
            const result = await addItemToCart(userId, currentCart, item.itemId, item.quantity); 
            results.push(result);
        } 
        
        const successfulItems = results.filter(r => r.success);
        if (successfulItems.length === 0) return "NO_ITEMS";

        // Preparar mensaje de éxito
        const addedNames = successfulItems.map(r => `${r.quantity}x ${r.name}`).join(', ');
        let feedbackMessage = `✅ *¡Entendido!* Se añadieron: ${addedNames}.\n`;

        // CASO A: Pedido Rápido (Tiene nombre y dirección)
        if (clienteInfo?.nombre && clienteInfo?.direccion) {
            
            // 🚩 LA CLAVE: ¿Tenemos método de pago real de la IA?
            const tienePago = clienteInfo.metodoPago && clienteInfo.metodoPago.trim() !== "";
            
            /// Actualizamos el carrito SIN borrar lo que ya existía
            await updateCart(userId, { 
                tempData: {
                    ...currentCart.tempData,
                    // Si la IA no detectó nombre/dirección ahora, mantenemos lo que ya estaba
                    name: clienteInfo.nombre || currentCart.tempData.name,
                    address: clienteInfo.direccion || currentCart.tempData.address,
                    paymentMethod: tienePago ? clienteInfo.metodoPago : currentCart.tempData.paymentMethod
                }, 
                conversationState: tienePago ? 'CONFIRMANDO_PEDIDO' : 'PREGUNTANDO_PAGO' 
            });

            const finalCart = await getOrCreateCart(userId);

            if (!tienePago) {
                // 1. Informamos lo que ya capturamos
                await enviarTexto(userId, `${feedbackMessage}\n📍 *Dirección:* ${clienteInfo.direccion}\n👤 *Nombre:* ${clienteInfo.nombre}`);
                // 2. Disparamos tus botones de pago (Asegúrate de que el nombre de la función sea correcto)
                await sendPaymentMethodOptions(userId);
            } else {
                // Si ya especificó el pago (ej: "pago con tarjeta"), vamos directo al resumen
                await sendCartSummary(userId, finalCart);
                //await enviarTexto(userId, `${feedbackMessage}\n🥳 *¡Pedido Rápido!* Escribe *CONFIRMAR* para finalizar.`);
            }
            
            return "AI_SUCCESS";
        }
        
        // CASO B: Solo productos (Sin datos de envío completos)
        await updateCart(userId, { conversationState: 'EN_CARRITO' });
        await enviarTexto(userId, `${feedbackMessage}\nEscribe *CARRITO* para revisar o *FINALIZAR* para continuar.`);
        return "AI_SUCCESS";

    } catch (error) {
        console.error('Error IA:', error);
        return "NO_ITEMS";
    }
}

// ----------------------------------------------------------------------
// WEBHOOK PRINCIPAL (POST)
// ----------------------------------------------------------------------

router.post('/webhook', async (req, res) => {
    let userId = null;

    try {
        const messageObject = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
        if (!messageObject) return res.sendStatus(200);

        userId = messageObject.from;
        const text = (messageObject.text?.body || '').trim().toLowerCase(); 
        const normalizedText = text.toUpperCase();

        // 1. OBTENER CARRITO INICIAL
        let cart = await getOrCreateCart(userId);
        const config = await getGlobalConfig(); 
        const open = config?.isBusinessOpen ?? true; 

        if (!open) {
            await enviarTexto(userId, config?.closedMessage || "Estamos cerrados temporalmente. Disculpa.");
            return res.sendStatus(200);
        }
        
        // --- MANEJAR INTERACCIONES (BOTONES) ---
        if (messageObject.interactive?.type === 'button_reply' && cart.conversationState === 'PREGUNTANDO_PAGO') {
            const interactiveData = messageObject.interactive.button_reply;
            if (interactiveData.id.startsWith('PAYMENT_')) {
                const method = interactiveData.id.replace('PAYMENT_', '').replace(/_/g, ' ');
                const cleanMethod = method.charAt(0).toUpperCase() + method.slice(1).toLowerCase(); 
                
                cart.tempData.paymentMethod = cleanMethod;
                // Actualizamos y refrescamos instancia
                cart = await updateCart(userId, { tempData: cart.tempData, conversationState: 'CONFIRMANDO_PEDIDO' });
                await sendCartSummary(userId, cart);
                //await enviarTexto(userId, "Hemos registrado tu forma de pago. Escribe *CONFIRMAR* para enviar el pedido.");
                return res.sendStatus(200);
            }
        }

        // --- MANEJAR COMANDOS GLOBALES (CON RECARGA DE SEGURIDAD) ---
        
        if (['MENÚ', 'MENU', 'HOLA'].includes(normalizedText)) {
            await sendMenu(userId);
            return res.sendStatus(200);
        }
        
        if (normalizedText === 'CARRITO') {
            cart = await getOrCreateCart(userId); // Refrescar antes de mostrar
            await sendCartSummary(userId, cart);
            return res.sendStatus(200);
        }

        if (normalizedText === 'FINALIZAR') {
            cart = await getOrCreateCart(userId); // Refrescar para ver items de IA
            if (!cart.items || cart.items.length === 0) {
                await enviarTexto(userId, "Tu carrito está vacío. Escribe *MENÚ* para empezar.");
            } else {
                await updateCart(userId, { conversationState: 'PREGUNTANDO_NOMBRE' });
                await enviarTexto(userId, "¡Perfecto! Vamos a finalizar. ¿Cuál es tu nombre completo?");
            }
            return res.sendStatus(200);
        }

        if (normalizedText.startsWith('QUITAR') && cart.items?.length > 0) {
            const index = parseInt(normalizedText.split(' ')[1]);
            if (!isNaN(index)) {
                await removeItemFromCart(userId, cart, index); // Asegúrate de que removeItem reciba 'cart'
                const updatedCart = await getOrCreateCart(userId);
                await sendCartSummary(userId, updatedCart);
            } else {
                await enviarTexto(userId, "Escribe QUITAR seguido del número del producto.");
            }
            return res.sendStatus(200);
        }

        if (normalizedText === 'CONFIRMAR' && cart.conversationState === 'CONFIRMANDO_PEDIDO') {
            const freshCart = await getOrCreateCart(userId); 
            
            // 🛡️ Validación ultra-segura
            const hasItems = freshCart && freshCart.items && Array.isArray(freshCart.items) && freshCart.items.length > 0;

            if (hasItems) {
                try {
                    await processFinalOrder(userId, freshCart); 
                    await updateCart(userId, { conversationState: 'INICIO', items: [] });
                    await enviarTexto(userId, "✅ ¡Pedido recibido con éxito! En un momento te contactaremos.");
                } catch (procError) {
                    logger.error('Error dentro de processFinalOrder:', procError);
                    throw procError; // Esto nos dirá si el .length falló DENTRO de la función del pedido
                }
            } else {
                await enviarTexto(userId, "Tu carrito parece estar vacío. 😅 Escribe *MENÚ* para agregar productos.");
            }
            return res.sendStatus(200);
        }
        
        if (normalizedText === 'AYUDA' || normalizedText === 'AGENTE') {
            await updateCart(userId, { conversationState: 'ESPERANDO_AGENTE' });
            await enviarTexto(userId, "Un agente humano ha sido notificado. Por favor, espera su mensaje.");
            return res.sendStatus(200);
        }

        // --- LÓGICA DE DECISIÓN HÍBRIDA (IA / ESTADOS) ---
        
        const isNumeric = !isNaN(text.trim()) && text.trim().length < 3;

        if (isNumeric) {
            await handleStateFlow(userId, text, cart);
            return res.sendStatus(200); 
        } 
        
        const aiResult = await handleAICheck(userId, text, cart);
        
        if (aiResult === "AI_SUCCESS") {
            // Si la IA tuvo éxito, ya respondió al usuario.
            return res.sendStatus(200); 
        } else {
            // Si la IA no entendió, probamos si el usuario está en un paso intermedio
            const stateResult = await handleStateFlow(userId, text, cart);
            
            if (stateResult === "TRY_AI") {
                await enviarTexto(userId, "No logré entender eso. 😅 Escribe *MENÚ* para ver las opciones.");
            }
            return res.sendStatus(200);
        }

    } catch (error) {
        logger.error('Error catastrófico en receiveMessage:', error);
        if (userId) {
            await enviarTexto(userId, "⚠️ Ocurrió un error inesperado. Intenta de nuevo o escribe *MENÚ*.");
        }
        if (!res.headersSent) res.sendStatus(500);
    }
});

router.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            logger.info('WEBHOOK_VERIFIED');
            return res.status(200).send(challenge);
        }
    }
    return res.sendStatus(403);
});

export default router;