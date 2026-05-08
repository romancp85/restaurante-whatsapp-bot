// src/whatsapp/webhook.js
/**import express from 'express';
import { getOrCreateCart, updateCart, addItemToCart } from './cartUtils.js'; 
import { sendMessage, sendMenu, sendCartSummary, sendPaymentMethodOptions, formatPrice } from './utils.js';
import { analizarPedidoConIA } from '../utils/aiUtils.js'; 
import { validarPedido, calcularTotalesFinales } from '../services/orderValidator.js'; 
import Restaurante from '../models/Restaurante.js';
import { processFinalOrder } from './orderProcessor.js';
import { verificarDisponibilidad } from '../utils/dateUtils.js';
import { decrypt } from '../utils/cryptoUtils.js'; 
import { enqueueOrder } from '../queues/orderQueue.js';
import logger from '../utils/logger.js';
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

    await updateCart(userId, businessId, { conversationState: 'CONFIRMANDO_PEDIDO' });
    await sendCartSummary(userId, cart, businessId, auth);
};

// --- 4. PORTERO NIVEL 1: COMANDOS ---
const manejarPorteroNivel1 = async (text, userId, businessId, auth, cart, restaurante) => {
    const normalizedText = text.toUpperCase().trim();

    if (['HOLA', 'MENU', 'MENÚ'].includes(normalizedText)) {
        // Limpiar carritos abandonados de más de 24 horas
        const unDiaEnMs = 24 * 60 * 60 * 1000;
        if ((new Date() - cart.updatedAt) > unDiaEnMs) {
            await updateCart(userId, businessId, { 
                items: [],
                tempData: { history: [], name: null, address: null, paymentMethod: null, deliveryMode: null },
                conversationState: 'INICIO' 
            });
            cart = await getOrCreateCart(userId, businessId);
        }

        // Lógica VIP: Solo si el carrito está vacío
        if (cart.items.length === 0) {
            const ultimo = await getUltimoPedido(userId, businessId);
            const propuesta = generarPropuestaVIP(ultimo);

            if (propuesta && cart.conversationState !== 'PROPUESTA_VIP') {
                await updateCart(userId, businessId, { conversationState: 'PROPUESTA_VIP' });
                await sendMessage(userId, {
                    type: "interactive",
                    interactive: {
                        type: "button",
                        body: { text: propuesta.texto },
                        action: {
                            buttons: [
                                { type: "reply", reply: { id: "REPETIR_PEDIDO", title: "✅ Sí, lo mismo" } },
                                { type: "reply", reply: { id: "MENU_NUEVO", title: "📋 Ver Menú" } }
                            ]
                        }
                    }
                }, auth);
                return true;
            }
        }

        // Si no hay VIP o ya hay items, mandamos menú normal
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

        // 🌟 CRÍTICO: Si la IA detecta que el usuario quiere agregar algo, 
        // rompemos cualquier estado anterior (VIP, Preguntas de datos, etc)
        if (aiResponse.items?.length > 0) {
            await updateCart(userId, businessId, { conversationState: 'MOSTRANDO_MENU' });
            cart.conversationState = 'MOSTRANDO_MENU'; 
        }

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

        await enviarBotonesContinuar(userId, aiResponse.waiterMessage, auth);

    } catch (e) {
        logger.error('Error handleAICheck:', e);
        await enviarTexto(userId, "Lo siento, tuve un problema procesando eso. ¿Podrías repetirlo?", auth);
    }
}

// --- 6. RUTA POST PRINCIPAL ---
const mensajesProcesados = new Set();

// src/whatsapp/webhook.js

import { enqueueOrder } from '../queues/orderQueue.js'; // 👈 Importamos la cola

router.post('/webhook', async (req, res) => {
    try {
        const value = req.body.entry?.[0]?.changes?.[0]?.value;
        const messageObject = value?.messages?.[0];
        
        // 1. Si no hay mensaje, ignorar
        if (!messageObject) return res.sendStatus(200);

        // 2. De-duplicación (Evita procesar el mismo ID dos veces si Meta lo reenvía)
        const messageId = messageObject.id;
        if (mensajesProcesados.has(messageId)) return res.sendStatus(200);
        mensajesProcesados.add(messageId);
        setTimeout(() => mensajesProcesados.delete(messageId), 300000);

        // 3. Identificar Restaurante y Auth (Necesario para saber a qué cola mandar)
        const restaurante = await Restaurante.findOne({ whatsappPhoneId: value.metadata.phone_number_id });
        if (!restaurante) return res.sendStatus(200);

        const businessId = restaurante._id;
        const tokenReal = decrypt(restaurante.whatsappToken);
        const auth = { token: tokenReal, phoneId: restaurante.whatsappPhoneId };

        // 4. FAST-PATH: Disponibilidad (Validamos aquí para no gastar recursos si está cerrado)
        const disponibilidad = verificarDisponibilidad(restaurante);
        if (!disponibilidad.abierto) {
            await enviarTexto(messageObject.from, disponibilidad.mensaje, auth);
            return res.sendStatus(200);
        }

        // 5. 🚀 EL CAMBIO CLAVE: ENCOLAR 
        // No llamamos a IA, ni a GPS, ni a Botones. Solo mandamos los datos al Worker.
        await enqueueOrder('WHATSAPP', {
            userId: messageObject.from,
            messageObject, // Mandamos el objeto completo para que el Worker vea si es texto, botón o GPS
            businessId,
            auth,
            restauranteConfig: restaurante.configuracion
        });

        // 6. RESPONDER A META INMEDIATAMENTE
        // Con esto Meta está feliz y no nos enviará duplicados por tardar mucho.
        res.sendStatus(200);

    } catch (error) {
        logger.error('Error Webhook (Fast Path):', error);
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

export default router;**/

// src/whatsapp/webhook.js
// src/whatsapp/webhook.js
import express from 'express';
import Restaurante from '../models/Restaurante.js';
import { decrypt } from '../utils/cryptoUtils.js'; 
import { verificarDisponibilidad } from '../utils/dateUtils.js';
import { enqueueOrder } from '../queues/orderQueue.js'; 
import { sendMessage } from './utils.js'; // 👈 1. SOLUCIÓN: Importación agregada (asumiendo que utils.js está en la misma carpeta)
import logger from '../utils/logger.js';

const router = express.Router();
const mensajesProcesados = new Set();

// Helper interno para el Fast-Path de cierre
const enviarTextoRapido = async (userId, texto, auth) => {
    await sendMessage(userId, { type: "text", text: { body: texto } }, auth);
};

router.post('/webhook', async (req, res) => {
    try {
        console.log("\n--- 📥 NUEVO EVENTO DESDE META ---");
        
        const value = req.body.entry?.[0]?.changes?.[0]?.value;
        const messageObject = value?.messages?.[0];

        // Filtro de seguridad: Si es una actualización de estado (leído, entregado), ignoramos y liberamos a Meta
        if (!messageObject) {
            console.log("[Fast-Path] Notificación de estado de Meta (Read/Delivered). Ignorando.");
            return res.sendStatus(200);
        }

        // 1. Evitar duplicados (Idempotencia)
        const messageId = messageObject.id;
        if (mensajesProcesados.has(messageId)) {
            console.log(`⚠️ [Fast-Path] Mensaje duplicado detectado y bloqueado: ${messageId}`);
            return res.sendStatus(200);
        }
        mensajesProcesados.add(messageId);
        setTimeout(() => mensajesProcesados.delete(messageId), 300000); // 5 minutos de memoria

        // 2. Identificar el Restaurante (Multi-tenant)
        const phoneId = value.metadata.phone_number_id;
        const restaurante = await Restaurante.findOne({ whatsappPhoneId: phoneId });
        
        if (!restaurante) {
            console.error(`❌ [Fast-Path Error] Ningún restaurante coincide con el Phone ID: ${phoneId}`);
            return res.sendStatus(200);
        }

        console.log(`✅ [Fast-Path] Restaurante identificado: ${restaurante.nombre}`);

        const businessId = restaurante._id.toString(); // Forzamos texto desde aquí
        const tokenReal = decrypt(restaurante.whatsappToken);
        const auth = { token: tokenReal, phoneId: restaurante.whatsappPhoneId };

        // 3. 🛡️ VERIFICAR HORARIO (FAST-PATH DE AHORRO)
        const disponibilidad = verificarDisponibilidad(restaurante);
        if (!disponibilidad.abierto) {
            console.log(`🏠 [Fast-Path] ${restaurante.nombre} está CERRADO. Enviando aviso de cierre.`);
            
            // 🌟 2. SOLUCIÓN: Enviamos el mensaje de cierre real configurado en tu DB
            await enviarTextoRapido(messageObject.from, disponibilidad.mensaje, auth);
            
            return res.sendStatus(200); // Cortamos el flujo de inmediato
        }

        // 4. 🚀 ENCOLAR EN BULLMQ (Para el Worker asíncrono)
        console.log("🚀 [Fast-Path] Mensaje válido y negocio abierto. Encolando en Redis...");
        await enqueueOrder('WHATSAPP', {
            userId: messageObject.from,
            messageObject, 
            businessId, // Ya viaja como String puro
            auth,
            restauranteConfig: restaurante.configuracion
        });

        console.log("✅ [Fast-Path] Encolado exitoso. Respondiendo 200 OK a Meta.");
        res.sendStatus(200);

    } catch (error) {
        console.error('💥 [Fast-Path Critical Error] Fallo en la recepción del Webhook:', error);
        res.sendStatus(500); // Meta reintentará el envío si respondemos 500
    }
});

// GET para validación de Meta (Token de verificación)
router.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === (process.env.VERIFY_TOKEN || "roman123")) {
        console.log("🔒 Webhook validado con éxito por Meta.");
        return res.status(200).send(challenge);
    }
    res.sendStatus(403);
});

export default router;