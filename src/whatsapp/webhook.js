// src/whatsapp/webhook.js
import express from 'express';
import { getOrCreateCart, updateCart, addItemToCart } from './cartUtils.js'; 
import { sendMessage, sendMenu, sendCartSummary, sendPaymentMethodOptions, formatPrice } from './utils.js';
import { analizarPedidoConIA } from '../utils/aiUtils.js'; 
import { validarPedido, calcularTotalesFinales } from '../services/orderValidator.js'; 
import Restaurante from '../models/Restaurante.js';
import { processFinalOrder } from './orderProcessor.js';
import { verificarDisponibilidad } from '../utils/dateUtils.js';
import { decrypt } from '../utils/cryptoUtils.js'; 
import logger from '../utils/logger.js';

// 🌟 NUEVAS IMPORTACIONES
import { getUltimoPedido, generarPropuestaVIP } from '../services/loyaltyService.js';
import { calcularDistanciaKM } from '../utils/geoUtils.js';

const router = express.Router();

// --- 1. HELPERS DE APOYO ---
const enviarTexto = async (userId, texto, auth) => {
    await sendMessage(userId, { type: "text", text: { body: texto } }, auth);
};

const enviarBotonesContinuar = async (userId, bodyText, auth) => {
    const buttons = [
        { id: "BTN_CHECKOUT", title: "🚀 Ir a Pagar" },
        { id: "BTN_VER_QUITAR", title: "🛒 Ver Carrito" },
        { id: "MENU", title: "📋 Ver Menú" }
    ];

    await sendMessage(userId, {
        type: "interactive",
        interactive: {
            type: "button",
            body: { text: bodyText },
            action: {
                buttons: buttons.map(btn => ({
                    type: "reply",
                    reply: { id: btn.id, title: btn.title }
                }))
            }
        }
    }, auth);
};

const enviarListaParaQuitar = async (userId, cart, auth) => {
    if (!cart.items || cart.items.length === 0) {
        return await enviarTexto(userId, "Tu carrito está vacío. 🛒", auth);
    }

    const rows = cart.items.map((item, index) => ({
        id: `REMOVE_IDX_${index}`, 
        title: `Quitar ${item.nombre}`.substring(0, 24),
        description: `${item.cantidad}x - ${formatPrice(item.precioUnitario * item.cantidad)}`.substring(0, 72)
    }));

    await sendMessage(userId, {
        type: "interactive",
        interactive: {
            type: "list",
            header: { type: "text", text: "Gestionar Carrito" },
            body: { text: "Selecciona el producto que deseas eliminar:" },
            footer: { text: "Toca para ver productos" },
            action: {
                button: "Ver Productos",
                sections: [{ title: "Tu Pedido Actual", rows }]
            }
        }
    }, auth);
};

const limpiarDato = (val) => (val && val !== 'null' && val !== 'undefined' && val !== '') ? val.trim() : null;

// --- 2. MOTOR DE ELIMINACIÓN ---
const handleRemoveItem = async (userId, businessId, index, cart, auth) => {
    if (cart.items && cart.items[index]) {
        const removedName = cart.items[index].nombre;
        const newItems = cart.items.filter((_, i) => i !== index);
        const carritoVacio = newItems.length === 0;

        await updateCart(userId, businessId, { 
            items: newItems,
            conversationState: carritoVacio ? 'INICIO' : cart.conversationState,
            tempData: carritoVacio ? { ...cart.tempData, history: [], lastProductDiscussed: null } : cart.tempData
        });

        await enviarTexto(userId, `✅ Eliminado: *${removedName}*.`, auth);
        if (carritoVacio) {
            await enviarTexto(userId, "🛒 Tu carrito está vacío. Escribe *MENÚ* para ver de nuevo.", auth);
        } else {
            await enviarBotonesContinuar(userId, "¿Deseas algo más o prefieres finalizar?", auth);
        }
    }
};

// --- 3. CHECKOUT INTELIGENTE ---
const ejecutarCheckoutInteligente = async (userId, businessId, cart, auth, restaurante) => {
    const { tempData } = cart;
    const config = restaurante.configuracion || {};

    if (!tempData.deliveryMode) {
        if (config.ofreceDelivery && !config.ofrecePickup) {
            tempData.deliveryMode = 'DELIVERY';
        } else if (!config.ofreceDelivery && config.ofrecePickup) {
            tempData.deliveryMode = 'PICKUP';
        } else {
            await updateCart(userId, businessId, { conversationState: 'PREGUNTANDO_MODO_ENTREGA' });
            await sendMessage(userId, {
                type: "interactive",
                interactive: {
                    type: "button",
                    body: { text: "Excelente elección. 🍽️ ¿Cómo gustas recibir tu pedido?" },
                    action: {
                        buttons: [
                            { type: "reply", reply: { id: "MODE_DELIVERY", title: "A domicilio 🛵" } },
                            { type: "reply", reply: { id: "MODE_PICKUP", title: "Recoger en tienda 🛍️" } }
                        ]
                    }
                }
            }, auth);
            return;
        }
    }

    if (!tempData.name || tempData.name.length < 2) {
        await updateCart(userId, businessId, { conversationState: 'PREGUNTANDO_NOMBRE' });
        await enviarTexto(userId, "¡Perfecto! ¿A nombre de quién registro el pedido? 👤", auth);
        return;
    }

    if (tempData.deliveryMode === 'DELIVERY' && !tempData.address) {
        await updateCart(userId, businessId, { conversationState: 'PREGUNTANDO_DIRECCION' });
        await enviarTexto(userId, "Para el envío, ¿cuál es tu dirección exacta? (O envía tu ubicación 📍)", auth);
        return;
    }

    if (!tempData.paymentMethod) {
        await updateCart(userId, businessId, { conversationState: 'PREGUNTANDO_PAGO' });
        await sendPaymentMethodOptions(userId, businessId, auth);
        return;
    }

    await updateCart(userId, businessId, { conversationState: 'CONFIRMANDO_PEDIDO', tempData });
    await sendCartSummary(userId, cart, businessId, auth);
};

// --- 4. PORTERO NIVEL 1: COMANDOS ---
const manejarPorteroNivel1 = async (text, userId, businessId, auth, cart, restaurante) => {
    const normalizedText = text.toUpperCase().trim();

    if (['HOLA', 'MENU', 'MENÚ'].includes(normalizedText)) {
        // Lógica VIP
        const ultimo = await getUltimoPedido(userId, businessId);
        const propuesta = generarPropuestaVIP(ultimo);

        if (propuesta) {
            await updateCart(userId, businessId, { conversationState: 'PROPUESTA_VIP' });
            await sendMessage(userId, {
                type: "interactive",
                interactive: {
                    type: "button",
                    body: { text: propuesta.texto },
                    action: {
                        buttons: [
                            { id: "REPETIR_PEDIDO", title: "✅ Sí, lo mismo" },
                            { id: "MENU_NUEVO", title: "📋 Ver Menú" }
                        ]
                    }
                }
            }, auth);
            return true;
        }

        const unDiaEnMs = 24 * 60 * 60 * 1000;
        if ((new Date() - cart.updatedAt) > unDiaEnMs) {
            await updateCart(userId, businessId, { 
                items: [],
                tempData: { history: [], name: null, address: null, paymentMethod: null, deliveryMode: null },
                conversationState: 'INICIO' 
            });
        }

        await sendMenu(userId, businessId, auth);
        return true;
    }

    if (normalizedText === 'CARRITO') {
        await enviarListaParaQuitar(userId, cart, auth);
        return true;
    }

    if (normalizedText === 'FINALIZAR' || normalizedText === 'PAGAR') {
        if (cart.items.length === 0) {
            await enviarTexto(userId, "Su carrito está vacío. 🛒", auth);
            return true;
        }
        await ejecutarCheckoutInteligente(userId, businessId, cart, auth, restaurante);
        return true;
    }

    return false;
};

// --- 5. PORTERO NIVEL 2: IA ---
async function handleAICheck(userId, text, cart, businessId, auth, restauranteConfig) {
    try {
        const history = cart.tempData.history || [];
        const aiResponse = await analizarPedidoConIA(text, businessId, history, restauranteConfig, cart.tempData.lastProductDiscussed, cart.tempData.menuMap); 

        if (aiResponse.extractedData) {
            const { nombre, direccion, metodoPago, modoEntrega, notasPago, notasCocina } = aiResponse.extractedData;
            const updates = {
                name: limpiarDato(nombre) || cart.tempData.name,
                address: limpiarDato(direccion) || cart.tempData.address,
                deliveryMode: limpiarDato(modoEntrega) || cart.tempData.deliveryMode,
                paymentMethod: metodoPago ? (metodoPago.charAt(0).toUpperCase() + metodoPago.slice(1).toLowerCase()) : cart.tempData.paymentMethod,
                orderNotes: [limpiarDato(notasPago), limpiarDato(notasCocina)].filter(Boolean).join(' | ') || cart.tempData.orderNotes
            };
            await updateCart(userId, businessId, { tempData: { ...cart.tempData, ...updates } });
        }

        if (['AMBIGUO', 'INCOMPLETO', 'NO_DISPONIBLE'].includes(aiResponse.status) && (!aiResponse.items || aiResponse.items.length === 0)) {    
            await enviarTexto(userId, aiResponse.waiterMessage, auth);
            return;
        }

        const { itemsValidados } = await validarPedido(aiResponse.items, businessId);
        if (itemsValidados && itemsValidados.length > 0) {
            for (const item of itemsValidados) {
                await addItemToCart(userId, businessId, item);
            }
            cart = await getOrCreateCart(userId, businessId);
        }

        const updatedHistory = [...history, { role: "user", content: text }, { role: "assistant", content: aiResponse.waiterMessage }].slice(-6);
        await updateCart(userId, businessId, { 
            tempData: { ...cart.tempData, history: updatedHistory, lastProductDiscussed: itemsValidados?.[0]?.nombre || cart.tempData.lastProductDiscussed } 
        });

        const isReady = cart.tempData.name && cart.tempData.paymentMethod && (cart.tempData.deliveryMode !== 'DELIVERY' || cart.tempData.address);
        await enviarBotonesContinuar(userId, aiResponse.waiterMessage, auth);

    } catch (e) {
        logger.error('Error handleAICheck:', e);
    }
}

// --- 6. RUTA POST PRINCIPAL ---
const mensajesProcesados = new Set();

router.post('/webhook', async (req, res) => {
    try {
        const value = req.body.entry?.[0]?.changes?.[0]?.value;
        const messageObject = value?.messages?.[0];
        if (!messageObject) return res.sendStatus(200);

        const messageId = messageObject.id;
        if (mensajesProcesados.has(messageId)) return res.sendStatus(200);
        mensajesProcesados.add(messageId);
        setTimeout(() => mensajesProcesados.delete(messageId), 300000);

        const userId = messageObject.from;
        const restaurante = await Restaurante.findOne({ whatsappPhoneId: value.metadata.phone_number_id });
        if (!restaurante) return res.sendStatus(200);

        const businessId = restaurante._id;
        const tokenReal = decrypt(restaurante.whatsappToken);
        const auth = { token: tokenReal, phoneId: restaurante.whatsappPhoneId };
        
        // 1. OBTENER CARRITO (Ahora disponible para todo el flujo)
        let cart = await getOrCreateCart(userId, businessId);

        // 2. HANDOFF / AGENTE HUMANO
        if (cart.conversationState === 'ESPERANDO_AGENTE') return res.sendStatus(200);

        // 3. DISPONIBILIDAD
        const disponibilidad = verificarDisponibilidad(restaurante);
        if (!disponibilidad.abierto) {
            await enviarTexto(userId, disponibilidad.mensaje, auth);
            return res.sendStatus(200);
        }

        // 4. MANEJO DE INTERACTIVOS
        if (messageObject.type === 'interactive') {
            const interactive = messageObject.interactive;
            
            if (interactive.type === 'button_reply') {
                const actionId = interactive.button_reply.id;
                
                if (actionId === 'REPETIR_PEDIDO') {
                    const ultimo = await getUltimoPedido(userId, businessId);
                    if (ultimo) {
                        await updateCart(userId, businessId, { 
                            items: ultimo.items, 
                            tempData: { ...cart.tempData, name: ultimo.nombreCliente, address: ultimo.direccionEntrega, deliveryMode: ultimo.entregaMode, paymentMethod: ultimo.metodoPago }
                        });
                        cart = await getOrCreateCart(userId, businessId);
                        await enviarTexto(userId, "✅ He cargado tu pedido anterior.", auth);
                        return await ejecutarCheckoutInteligente(userId, businessId, cart, auth, restaurante), res.sendStatus(200);
                    }
                }
                
                if (actionId === 'BTN_CHECKOUT') return await ejecutarCheckoutInteligente(userId, businessId, cart, auth, restaurante), res.sendStatus(200);
                if (actionId === 'BTN_LANZAR_LISTA_QUITAR') return await enviarListaParaQuitar(userId, cart, auth), res.sendStatus(200);
                if (actionId === 'BTN_VER_QUITAR') return await sendCartSummary(userId, cart, businessId, auth), res.sendStatus(200);
                if (actionId === 'MENU' || actionId === 'MENU_NUEVO') return await sendMenu(userId, businessId, auth), res.sendStatus(200);
                
                if (actionId === 'BTN_CONFIRMAR_FINAL') {
                    const isReady = !!(cart.tempData.name && cart.tempData.paymentMethod && (cart.tempData.deliveryMode === 'PICKUP' || cart.tempData.address));
                    if (isReady) {
                        const financieros = calcularTotalesFinales(cart.items, cart.tempData.deliveryMode, restaurante);
                        return await processFinalOrder(userId, cart, businessId, auth, financieros);
                    }
                    return await ejecutarCheckoutInteligente(userId, businessId, cart, auth, restaurante), res.sendStatus(200);
                }

                if (actionId.startsWith('MODE_')) cart.tempData.deliveryMode = actionId === 'MODE_DELIVERY' ? 'DELIVERY' : 'PICKUP';
                else if (actionId.startsWith('PAYMENT_')) {
                    const method = actionId.replace('PAYMENT_', '').replace(/_/g, ' ');
                    cart.tempData.paymentMethod = method.charAt(0).toUpperCase() + method.slice(1).toLowerCase();
                }
            }

            if (interactive.type === 'list_reply') {
                const listId = interactive.list_reply.id;
                if (listId.startsWith('REMOVE_IDX_')) {
                    const index = parseInt(listId.split('_')[2]);
                    await handleRemoveItem(userId, businessId, index, cart, auth);
                    return res.sendStatus(200);
                }
            }

            await updateCart(userId, businessId, { tempData: cart.tempData });
            await ejecutarCheckoutInteligente(userId, businessId, cart, auth, restaurante);
            return res.sendStatus(200);
        }

        // 5. GPS / UBICACIÓN + GEOFENCING
        if (messageObject.type === 'location') {
            const { latitude, longitude } = messageObject.location;
            const [restLat, restLon] = restaurante.configuracion.ubicacionLocal?.split(',').map(Number) || [0,0];
            const distancia = calcularDistanciaKM(latitude, longitude, restLat, restLon);

            if (distancia > 5) { // Límite 5km
                await enviarTexto(userId, `📍 Estás a ${distancia.toFixed(1)}km. Por ahora solo entregamos a 5km a la redonda. ¿Podrías pasar a recogerlo?`, auth);
                cart.tempData.deliveryMode = 'PICKUP';
            } else {
                cart.tempData.address = `https://www.google.com/maps?q=${latitude},${longitude}`;
                cart.tempData.deliveryMode = 'DELIVERY';
                await enviarTexto(userId, "📍 Ubicación guardada.", auth);
            }
            await updateCart(userId, businessId, { tempData: cart.tempData });
            await ejecutarCheckoutInteligente(userId, businessId, cart, auth, restaurante);
            return res.sendStatus(200);
        }

        // 6. TEXTO Y COMANDOS
        const text = (messageObject.text?.body || '').trim();
        
        // Handoff Check (Sentimiento negativo)
        const frustracion = ['AGENTE', 'HUMANO', 'AYUDA', 'MALISIMO', 'NO ENTIENDO'].some(k => text.toUpperCase().includes(k));
        if (frustracion) {
            await updateCart(userId, businessId, { conversationState: 'ESPERANDO_AGENTE' });
            await enviarTexto(userId, "Comprendo. He pausado mi asistencia. Un agente humano te atenderá pronto. 👨‍💻", auth);
            return res.sendStatus(200);
        }

        if (await manejarPorteroNivel1(text, userId, businessId, auth, cart, restaurante)) return res.sendStatus(200);

        // FSM: Captura de Datos
        if (['PREGUNTANDO_NOMBRE', 'PREGUNTANDO_DIRECCION'].includes(cart.conversationState)) {
            if (cart.conversationState === 'PREGUNTANDO_NOMBRE') cart.tempData.name = text;
            else if (cart.conversationState === 'PREGUNTANDO_DIRECCION') cart.tempData.address = text;
            await updateCart(userId, businessId, { tempData: cart.tempData });
            await ejecutarCheckoutInteligente(userId, businessId, cart, auth, restaurante);
            return res.sendStatus(200);
        }

        // IA FINAL
        await handleAICheck(userId, text, cart, businessId, auth, restaurante.configuracion);
        res.sendStatus(200);

    } catch (error) {
        logger.error('Error Webhook:', error);
        res.sendStatus(500);
    }
});

router.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === (process.env.VERIFY_TOKEN || "roman123")) return res.status(200).send(challenge);
    res.sendStatus(403);
});

export default router;