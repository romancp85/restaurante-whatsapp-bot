// src/whatsapp/webhook.js - VERSIÓN FINAL ESTABLE CON CORRECCIÓN DE SCOPE

import express from 'express';
// Asegúrate de que addItemToCart es la versión que devuelve el objeto de resultado estructurado
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

// 🛑 DEFINICIÓN CRÍTICA: Define enviarTexto localmente para asegurar el scope 🛑
const enviarTexto = async (to, texto) => {
    // Usamos el sendMessage importado de ./utils.js
    await sendMessage(to, { type: "text", text: { body: texto } });
};

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
                await enviarTexto(from, `¿Cuántas unidades de *${selectedItem.nombre}* deseas? (Solo el número)`);
            } else {
                await enviarTexto(from, "No entendí ese número. Por favor, selecciona un producto enviando su número (ej: 5) o escribe *MENÚ* para ver la lista de nuevo.");
            }
            break;
        
        case 'PREGUNTANDO_CANTIDAD':
            const quantity = parseInt(text);
            if (quantity > 0 && cart.tempData.currentItemId) {
                const itemId = cart.tempData.currentItemId;
                await addItemToCart(cart, itemId, quantity); 
                
                cart.tempData = {};
                await updateCart(from, { tempData: {}, conversationState: 'EN_CARRITO' });
                await enviarTexto(from, "¡Añadido! Escribe *CARRITO* para revisar o *MENÚ* para seguir agregando.");
            } else {
                await enviarTexto(from, "Por favor, ingresa una cantidad válida (solo números).");
            }
            break;

        case 'EN_CARRITO':
            await enviarTexto(from, "Escribe *MENÚ* para agregar más productos o *FINALIZAR* para continuar.");
            break;

        case 'PREGUNTANDO_NOMBRE':
            cart.tempData.name = text.trim();
            await updateCart(from, { tempData: cart.tempData, conversationState: 'PREGUNTANDO_DIRECCION' });
            await enviarTexto(from, `¡Genial, ${cart.tempData.name}! ¿Cuál es la *dirección completa* para la entrega?`);
            break;

        case 'PREGUNTANDO_DIRECCION':
            cart.tempData.address = text.trim();
            await updateCart(from, { tempData: cart.tempData, conversationState: 'PREGUNTANDO_PAGO' });
            await sendPaymentMethodOptions(from);
            break;

        case 'PREGUNTANDO_PAGO':
            await sendPaymentMethodOptions(from);
            await enviarTexto(from, "Por favor, selecciona una opción con los botones.");
            break;
            
        case 'CONFIRMANDO_PEDIDO':
            await enviarTexto(from, "Por favor, escribe *CONFIRMAR* para procesar tu pedido o *CARRITO* para revisar antes de finalizar.");
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
 */
async function handleAICheck(from, text, cart) {
    // 🛑 AGREGAMOS UN TRY/CATCH AISLADO PARA DEPURAR FALLAS SEVERAS 🛑
    try {
        if (!text) return await handleStateFlow(from, text, cart);

        const aiResponse = await analizarPedidoConIA(text); 
        const itemsAñadir = aiResponse?.items || [];
        const clienteInfo = aiResponse?.clienteInfo; 

        if (itemsAñadir.length === 0) {
            return await handleStateFlow(from, text, cart);
        }
        
        const results = [];
        
        // 1. Procesar ítems y obtener resultados detallados
        for (const item of itemsAñadir) {
            const result = await addItemToCart(cart, item.itemId, item.quantity); 
            results.push(result);
        } 
        
        const successfulItems = results.filter(r => r.success);
        const failedItems = results.filter(r => !r.success);

        let feedbackMessage = '';

        // A. Reportar Éxitos
        if (successfulItems.length > 0) {
            const addedNames = successfulItems.map(r => `${r.quantity}x ${r.name}`).join(', ');
            feedbackMessage += `✅ *¡Entendido!* Se añadieron al carrito: ${addedNames}.\n`;
        }

        // B. Reportar Fallos
        if (failedItems.length > 0) {
            const failureMessages = failedItems.map(r => {
                switch (r.reason) {
                    case 'NO_DISPONIBLE':
                        return `❌ *${r.name}*: Está agotado por hoy.`;
                    case 'SIN_STOCK':
                        return `❌ *${r.name}*: Solo quedan ${r.available || 0} unidades. No se añadió.`;
                    case 'INACTIVO':
                        return `❌ *${r.name}*: Ya no está en nuestro menú permanente.`;
                    case 'NO_ENCONTRADO':
                        return `❌ Producto con ID ${r.name} no encontrado.`;
                    default:
                        return `❌ Producto ${r.name}: Falló la validación.`;
                }
            }).join('\n');

            feedbackMessage += `\n\n*⚠️ Tuvimos problemas con estos ítems:*\n${failureMessages}`;
        }

        // 2. Procesar Datos de Cliente (SALTO RÁPIDO)
        if (successfulItems.length > 0 && clienteInfo && clienteInfo.nombre && clienteInfo.direccion) {
            cart.tempData.name = clienteInfo.nombre;
            cart.tempData.address = clienteInfo.direccion;
            const rawPayment = clienteInfo.metodoPago || 'Efectivo';
            const formattedMethod = rawPayment.charAt(0).toUpperCase() + rawPayment.slice(1).toLowerCase();
            cart.tempData.paymentMethod = formattedMethod;

            await updateCart(from, { tempData: cart.tempData, conversationState: 'CONFIRMANDO_PEDIDO' });
            await enviarTexto(from, `${feedbackMessage}\n\n🥳 *¡Pedido Rápido!* He capturado tus datos. Escribe *CARRITO* para revisar o *CONFIRMAR* para enviar.`);
            return; 
        }
        
        // 3. Respuesta si solo se agregaron ítems (o si hubo fallos parciales)
        if (successfulItems.length > 0) {
            await updateCart(from, { conversationState: 'EN_CARRITO' });
            await enviarTexto(from, `${feedbackMessage}\n\nEscribe *MENÚ* o *FINALIZAR* para completar tu pedido.`);
            return;
        } 
        
        // Si no se pudo añadir nada, pero hubo un intento de IA
        if (failedItems.length > 0) {
            await enviarTexto(from, feedbackMessage);
            return;
        }

        // Si no es un comando y la IA no encontró nada, volvemos al flujo de estado normal
        await handleStateFlow(from, text, cart);

    } catch (error) {
        // Usamos console.error directamente para garantizar que el error sea visible
        console.error('ERROR CRÍTICO EN handleAICheck:', error); 
        await enviarTexto(from, "⚠️ Lo sentimos, ocurrió un error interno al procesar tu pedido. Por favor, inténtalo de nuevo.");
    }
}


// ----------------------------------------------------------------------
// WEBHOOK PRINCIPAL (POST)
// ----------------------------------------------------------------------

router.post('/webhook', async (req, res) => {
    // 🛑 CORRECCIÓN 3: Inicializar variables críticas fuera del try 🛑
    let from = null; 
    let messageObject = null;

    try {
        messageObject = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
        if (!messageObject) {
            return res.sendStatus(200);
        }

        from = messageObject.from; 
        const text = (messageObject.text?.body || '').trim().toLowerCase(); 
        const normalizedText = text.toUpperCase();

        // 1. Obtener o crear el carrito de compras
        const cart = await getOrCreateCart(from);
        
        // 2. Verificar horario de atención
        const config = await getGlobalConfig(); 
        const open = config?.isBusinessOpen ?? true; 
        const closedMessage = config?.closedMessage ?? "Estamos cerrados temporalmente. Disculpa.";

        if (!open) {
            await enviarTexto(from, closedMessage); 
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
                await enviarTexto(from, "Hemos registrado tu forma de pago. Escribe *CONFIRMAR* para enviar el pedido.");
                return res.sendStatus(200);
            }
        }


        // 4. Manejar Comandos Globales
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
                await enviarTexto(from, "Tu carrito está vacío. Escribe *MENÚ* para empezar.");
            } else {
                await updateCart(from, { conversationState: 'PREGUNTANDO_NOMBRE' });
                await enviarTexto(from, "¡Perfecto! Vamos a finalizar. ¿Cuál es tu nombre completo?");
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
            await enviarTexto(from, "Un agente humano ha sido notificado y se pondrá en contacto contigo a la brevedad. Por favor, espera su mensaje.");
            return res.sendStatus(200);
        }


        // 5. Flujo de IA o Flujo de Estado
        
        if (cart.items.length === 0 || ['INICIO', 'EMPEZAR'].includes(cart.conversationState)) {
            await handleAICheck(from, text, cart); 
        } else {
            await handleStateFlow(from, text, cart);
        }

        res.sendStatus(200);

    } catch (error) {
        logger.error('Error catastrófico en receiveMessage:', error);
        if (from) {
            await enviarTexto(from, "⚠️ Lo sentimos, un error inesperado ocurrió. Por favor, intenta de nuevo o escribe *MENÚ*.");
        }
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