// src/whatsapp/webhook.js - VERSIÓN FINAL CON CORRECCIÓN DE BUCLE "HOLA"

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
// FUNCIONES AUXILIARES PARA EL FLUJO DE ESTADOS
// ----------------------------------------------------------------------

/**
 * Procesa el mensaje de un cliente en función del estado de la conversación.
 * @param {string} from - Número de teléfono del cliente.
 * @param {string} text - Contenido del mensaje (en minúsculas y trim).
 * @param {object} cart - Objeto de carrito actual.
 */
async function handleStateFlow(from, text, cart) {
    const currentState = cart.conversationState;

    switch (currentState) {
        
        case 'INICIO':
        case 'EMPEZAR':
            await sendMenu(from);
            break;

        case 'MOSTRANDO_MENU':
            const menuSelection = parseInt(text);
            const selectedItem = cart.tempData.menuMap?.find(item => item.index === menuSelection);

            if (selectedItem) {
                cart.tempData.currentItemId = selectedItem.itemId;
                cart.tempData.itemName = selectedItem.nombre;
                await updateCart(from, { tempData: cart.tempData, conversationState: 'PREGUNTANDO_CANTIDAD' });
                await sendMessage(from, `¿Cuántas unidades de *${selectedItem.nombre}* deseas? (Solo el número)`);
            } else {
                // 🛑 CORRECCIÓN: Si el usuario escribe texto libre y está en el menú,
                // enviamos el menú de nuevo con un mensaje claro, en lugar de un error.
                await sendMessage(from, "No entendí ese número. Por favor, selecciona un producto enviando su número (ej: 5) o escribe *MENÚ* para ver la lista de nuevo.");
            }
            break;
        
        case 'PREGUNTANDO_CANTIDAD':
        // ... (el resto de este case se mantiene igual)
            const quantity = parseInt(text);
            if (quantity > 0 && cart.tempData.currentItemId) {
                const itemId = cart.tempData.currentItemId;
                await addItemToCart(cart, itemId, quantity); 
                
                cart.tempData = {};
                await updateCart(from, { tempData: {}, conversationState: 'EN_CARRITO' });
                await sendMessage(from, "¡Añadido! Escribe *CARRITO* para revisar o *MENÚ* para seguir agregando.");
            } else {
                await sendMessage(from, "Por favor, ingresa una cantidad válida (solo números).");
            }
            break;

        case 'EN_CARRITO':
        // ... (se mantiene igual)
            await sendMessage(from, "Escribe *MENÚ* para agregar más productos o *FINALIZAR* para continuar.");
            break;

        case 'PREGUNTANDO_NOMBRE':
        // ... (se mantiene igual)
            cart.tempData.name = text.trim();
            await updateCart(from, { tempData: cart.tempData, conversationState: 'PREGUNTANDO_DIRECCION' });
            await sendMessage(from, `¡Genial, ${cart.tempData.name}! ¿Cuál es la *dirección completa* para la entrega?`);
            break;

        case 'PREGUNTANDO_DIRECCION':
        // ... (se mantiene igual)
            cart.tempData.address = text.trim();
            await updateCart(from, { tempData: cart.tempData, conversationState: 'PREGUNTANDO_PAGO' });
            await sendPaymentMethodOptions(from);
            break;

        case 'PREGUNTANDO_PAGO':
        // ... (se mantiene igual)
            await sendPaymentMethodOptions(from);
            await sendMessage(from, "Por favor, selecciona una opción con los botones.");
            break;
            
        case 'CONFIRMANDO_PEDIDO':
        // ... (se mantiene igual)
            await sendMessage(from, "Por favor, escribe *CONFIRMAR* para procesar tu pedido o *CARRITO* para revisar antes de finalizar.");
            break;
        
        case 'ESPERANDO_AGENTE':
            logger.info(`Cliente ${from} en Handoff. Ignorando mensaje.`);
            break;

        default:
            await sendMenu(from);
            break;
    }
}


/**
 * Intenta analizar el texto libre con IA para añadir productos y datos de envío.
 * @param {string} from - Número de teléfono.
 * @param {string} text - Contenido del mensaje (en minúsculas y trim).
 * @param {object} cart - Objeto de carrito actual.
 */
async function handleAICheck(from, text, cart) {
    if (text) {
        const aiResponse = await analizarPedidoConIA(text); 
        const itemsAñadir = aiResponse?.items || [];
        const clienteInfo = aiResponse?.clienteInfo; 

        let addedCount = 0;

        // 1. Procesar ítems
        if (itemsAñadir.length > 0) {
            for (const item of itemsAñadir) {
                const resultCart = await addItemToCart(cart, item.itemId, item.quantity, item.notes);
                if (resultCart) addedCount++;
            }
        } 

        // 2. Procesar y Guardar Datos de Cliente (SALTO RÁPIDO)
        if (addedCount > 0 && clienteInfo && clienteInfo.nombre && clienteInfo.direccion) {
            
            cart.tempData.name = clienteInfo.nombre;
            cart.tempData.address = clienteInfo.direccion;
            
            const rawPayment = clienteInfo.metodoPago || 'Efectivo';
            const formattedMethod = rawPayment.charAt(0).toUpperCase() + rawPayment.slice(1).toLowerCase();
            cart.tempData.paymentMethod = formattedMethod;
            
            await updateCart(from, { tempData: cart.tempData, conversationState: 'CONFIRMANDO_PEDIDO' });

            await sendMessage(from, `🥳 *¡Pedido Rápido!* He añadido ${addedCount} productos y capturé tus datos.\n\nEscribe *CARRITO* para revisar o *CONFIRMAR* para enviar.`);
            return; 
        }
        
        // 3. Respuesta si solo se agregaron ítems (o si la IA no pudo saltar)
        if (addedCount > 0) {
            await updateCart(from, { conversationState: 'EN_CARRITO' });
            await sendMessage(from, `🤖 Entendido! He añadido ${addedCount} productos a tu carrito. Escribe *CARRITO* para revisar o *MENÚ* para seguir agregando.`);
            return;
        } 
        
        // Si no es un comando y la IA no encontró nada, volvemos al flujo de estado normal
        await handleStateFlow(from, text, cart);
    }
}


// ----------------------------------------------------------------------
// WEBHOOK PRINCIPAL (POST)
// ----------------------------------------------------------------------

router.post('/webhook', async (req, res) => {
    try {
        // LECTURA DIRECTA DEL OBJETO DE MENSAJE
        const messageObject = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
        if (!messageObject) {
            return res.sendStatus(200);
        }

        const from = messageObject.from;
        const text = (messageObject.text?.body || '').trim().toLowerCase(); 
        const normalizedText = text.toUpperCase();

        // 1. Obtener o crear el carrito de compras
        const cart = await getOrCreateCart(from);
        
        // 2. Verificar horario de atención
        const config = await getGlobalConfig(); 
        const open = config?.isBusinessOpen ?? true; 
        const closedMessage = config?.closedMessage ?? "Estamos cerrados temporalmente. Disculpa.";

        if (!open) {
            await sendMessage(from, closedMessage);
            return res.sendStatus(200);
        }
        
        // 3. Manejar interacciones (Botones de pago)
        if (messageObject.interactive?.type === 'button_reply' && cart.conversationState === 'PREGUNTANDO_PAGO') {
            const interactiveData = messageObject.interactive.button_reply;
            if (interactiveData.id.startsWith('PAYMENT_')) {
                const method = interactiveData.id.replace('PAYMENT_', '').replace(/_/g, ' ');
                const cleanMethod = method.charAt(0).toUpperCase() + method.slice(1).toLowerCase(); 
                
                cart.tempData.paymentMethod = cleanMethod;

                await updateCart(from, { tempData: cart.tempData, conversationState: 'CONFIRMANDO_PEDIDO' });
                await sendCartSummary(from, cart);
                await sendMessage(from, "Hemos registrado tu forma de pago. Escribe *CONFIRMAR* para enviar el pedido.");
                return res.sendStatus(200);
            }
        }


        // 4. Manejar Comandos Globales
        // 🛑 CORRECCIÓN: INCLUIR HOLA/MENU EN COMANDOS GLOBALES 🛑
        if (normalizedText === 'MENÚ' || normalizedText === 'MENU' || normalizedText === 'HOLA') {
            await sendMenu(from);
            return res.sendStatus(200);
        }
        
        if (normalizedText === 'CARRITO') {
            await sendCartSummary(from, cart);
            return res.sendStatus(200);
        }

        if (normalizedText === 'FINALIZAR') {
            if (cart.items.length === 0) {
                 await sendMessage(from, "Tu carrito está vacío. Escribe *MENÚ* para empezar.");
            } else {
                await updateCart(from, { conversationState: 'PREGUNTANDO_NOMBRE' });
                await sendMessage(from, "¡Perfecto! Vamos a finalizar. ¿Cuál es tu nombre completo?");
            }
            return res.sendStatus(200);
        }

        if (normalizedText.startsWith('QUITAR') && cart.items.length > 0) {
            const index = parseInt(normalizedText.split(' ')[1]);
            await removeItemFromCart(cart, index);
            await sendCartSummary(from, cart);
            return res.sendStatus(200);
        }

        if (normalizedText === 'CONFIRMAR' && cart.conversationState === 'CONFIRMANDO_PEDIDO') {
            await processFinalOrder(cart); 
            await updateCart(from, { conversationState: 'INICIO' }); 
            return res.sendStatus(200);
        }
        
        if (normalizedText === 'AYUDA' || normalizedText === 'AGENTE') {
            await updateCart(from, { conversationState: 'ESPERANDO_AGENTE' });
            await sendMessage(from, "Un agente humano ha sido notificado y se pondrá en contacto contigo a la brevedad. Por favor, espera su mensaje.");
            return res.sendStatus(200);
        }


        // 5. Flujo de IA o Flujo de Estado
        
        if (cart.items.length === 0 || ['INICIO', 'EMPEZAR'].includes(cart.conversationState)) {
             // Usamos 'text' (minúsculas) aquí para el análisis de IA
             await handleAICheck(from, text, cart); 
        } else {
             // Si hay ítems o está en medio de un flujo, usamos el flujo de estado
             await handleStateFlow(from, text, cart);
        }

        res.sendStatus(200);

    } catch (error) {
        logger.error('Error catastrófico en receiveMessage:', error);
        await sendMessage(messageObject?.from, "⚠️ Lo sentimos, un error inesperado ocurrió. Por favor, intenta de nuevo o escribe *MENÚ*.");
        res.sendStatus(500);
    }
});


// ----------------------------------------------------------------------
// ENDPOINTS DE VERIFICACIÓN (GET)
// ----------------------------------------------------------------------

router.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            logger.info('WEBHOOK_VERIFIED');
            return res.status(200).send(challenge);
        } else {
            return res.sendStatus(403);
        }
    }
    return res.sendStatus(400);
});

export default router;