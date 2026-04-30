// src/whatsapp/webhook.js
import express from 'express';
import { getOrCreateCart, updateCart, addItemToCart } from './cartUtils.js'; 
import { sendMessage, sendMenu, sendCartSummary, sendPaymentMethodOptions, formatPrice } from './utils.js';
import { analizarPedidoConIA } from '../utils/aiUtils.js'; 
import { validarPedido, calcularTotalesFinales } from '../services/orderValidator.js'; 
import Restaurante from '../models/Restaurante.js';
import { processFinalOrder } from './orderProcessor.js';
import logger from '../utils/logger.js';

const router = express.Router();

// --- HELPERS ---
const enviarTexto = async (userId, texto, auth) => {
    await sendMessage(userId, { type: "text", text: { body: texto } }, auth);
};

// --- MOTOR DE ELIMINACIÓN ---
const handleRemoveItem = async (userId, businessId, index, cart, auth) => {
    const itemIdx = parseInt(index) - 1;
    
    if (cart.items && cart.items[itemIdx]) {
        const removedName = cart.items[itemIdx].nombre;
        const newItems = cart.items.filter((_, i) => i !== itemIdx);
        const carritoVacio = newItems.length === 0;

        // 🌟 CORRECCIÓN: Si el carrito se vacía, limpiamos la memoria de la IA
        const nuevosTempData = { ...cart.tempData };
        if (carritoVacio) {
            nuevosTempData.history = []; // Borramos el historial de charla
            nuevosTempData.lastProductDiscussed = null; // Borramos el último producto
            nuevosTempData.menuMap = []; // Opcional: Limpiamos mapa numérico
        }

        await updateCart(userId, businessId, { 
            items: newItems,
            conversationState: carritoVacio ? 'INICIO' : cart.conversationState,
            tempData: nuevosTempData // Aplicamos la limpieza
        });

        await enviarTexto(userId, `✅ Eliminado: *${removedName}*.`, auth);

        if (carritoVacio) {
            await enviarTexto(userId, "🛒 Tu carrito ahora está vacío.\n\n¿Te gustaría ver el *MENÚ* nuevamente para elegir algo más? 🍕", auth);
        } else {
            const updatedCart = { ...cart, items: newItems, tempData: nuevosTempData };
            await sendCartSummary(userId, updatedCart, businessId, auth);
        }
    } else {
        // Si intenta quitar algo de un carrito vacío o índice inexistente
        await enviarTexto(userId, `❌ No encontré el producto #${index}.`, auth);
        
        // Si el carrito ya estaba vacío de antes, recordamos el menú
        if (cart.items.length === 0) {
            await enviarTexto(userId, "Tu carrito está vacío. Escribe *MENÚ* para ver nuestros productos. 🍕", auth);
        }
    }
};

// --- CHECKOUT INTELIGENTE (Slot-Filling) ---
const ejecutarCheckoutInteligente = async (userId, businessId, cart, auth, restaurante) => {
    const { tempData } = cart;
    const { ofreceDelivery, ofrecePickup } = restaurante.configuracion || { ofreceDelivery: true, ofrecePickup: true };

    // 1. MODO DE ENTREGA
    if (!tempData.deliveryMode) {
        if (ofreceDelivery && !ofrecePickup) {
            tempData.deliveryMode = 'DELIVERY';
            await updateCart(userId, businessId, { tempData: { ...tempData, deliveryMode: 'DELIVERY' } });
        } else if (!ofreceDelivery && ofrecePickup) {
            tempData.deliveryMode = 'PICKUP';
            await updateCart(userId, businessId, { tempData: { ...tempData, deliveryMode: 'PICKUP' } });
        } else {
            await updateCart(userId, businessId, { conversationState: 'PREGUNTANDO_MODO_ENTREGA' });
            await sendMessage(userId, {
                type: "interactive",
                interactive: {
                    type: "button",
                    body: { text: "¿Cómo gusta recibir su pedido?" },
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

    // 2. NOMBRE (Evita nombres de productos como nombres de clientes)
    if (!tempData.name || tempData.name === 'null' || tempData.name.length < 2) {
        await updateCart(userId, businessId, { conversationState: 'PREGUNTANDO_NOMBRE' });
        await enviarTexto(userId, "¡Perfecto! ¿A nombre de quién registro el pedido?", auth);
        return;
    }

    // 3. DIRECCIÓN
    if (tempData.deliveryMode === 'DELIVERY' && !tempData.address) {
        await updateCart(userId, businessId, { conversationState: 'PREGUNTANDO_DIRECCION' });
        await enviarTexto(userId, "Para el envío, ¿cuál es tu dirección exacta? (O envía tu ubicación GPS 📍)", auth);
        return;
    }

    // 4. PAGO
    if (!tempData.paymentMethod) {
        await updateCart(userId, businessId, { conversationState: 'PREGUNTANDO_PAGO' });
        await sendPaymentMethodOptions(userId, businessId, auth);
        return;
    }

    // 5. RESUMEN FINAL
    await updateCart(userId, businessId, { conversationState: 'CONFIRMANDO_PEDIDO' });
    cart.conversationState = 'CONFIRMANDO_PEDIDO'; // Actualización inmediata en memoria
    
    await enviarTexto(userId, `✅ ¡Excelente! Ya tengo todos tus datos. Aquí tienes el resumen final para confirmar:`, auth);
    await sendCartSummary(userId, cart, businessId, auth);
};

// --- PORTERO NIVEL 1: COMANDOS ---
const manejarPorteroNivel1 = async (text, userId, businessId, auth, cart, restaurante) => {
    const normalizedText = text.toUpperCase().trim();
    const esComandoMenu = ['MENU', 'MENÚ', 'CARTA'].includes(normalizedText);
    const esHolaCorto = normalizedText.length < 10 && normalizedText.includes('HOLA');
    const frasesAfirmativas = ['SI', 'SÍ', 'POR FAVOR', 'DALE', 'OK', 'ACEPTO'];
    const esPreguntaMenu = ['CUALES TIENES', 'QUE HAY', 'OPCIONES', 'QUE TIENEN', 'VER MENU'].some(f => normalizedText.includes(f));

    if (esComandoMenu || esHolaCorto) {
        if (cart.items && cart.items.length > 0) return false; 
        await updateCart(userId, businessId, { 
            tempData: { ...cart.tempData, deliveryMode: null, paymentMethod: null, name: null, orderNotes: null, address: null },
            conversationState: 'INICIO' 
        });
        await sendMenu(userId, businessId, auth);
        return true;
    }


    if (esPreguntaMenu) {
    await sendMenu(userId, businessId, auth);
    return true;
}

    // 🌟 NUEVO: INTERCEPTOR DE NÚMEROS (Ej: "2", "2 y 5", "1,3")
    const numerosEncontrados = normalizedText.match(/\d+/g); 
    if (numerosEncontrados && cart.tempData.menuMap && !normalizedText.includes('QUITAR')) {
        let agregados = [];
        for (const num of numerosEncontrados) {
            const mapping = cart.tempData.menuMap.find(m => m.index === parseInt(num));
            if (mapping) {
                // Añadimos al carrito usando la lógica existente
                await addItemToCart(userId, businessId, { 
                    itemId: mapping.itemId, 
                    quantity: 1, 
                    notas: "" 
                });
                agregados.push(mapping.nombre);
            }
        }
        if (agregados.length > 0) {
            await enviarTexto(userId, `✅ Añadido: *${agregados.join(', ')}*.\n\nEscribe *CARRITO* para revisar o sigue pidiendo.`, auth);
            return true;
        }
    }

    if (frasesAfirmativas.includes(normalizedText) && cart.items.length === 0) {
        await sendMenu(userId, businessId, auth);
        return true;
    }

    if (normalizedText === 'CARRITO') {
        await sendCartSummary(userId, cart, businessId, auth);
        return true;
    }

    if (normalizedText.startsWith('QUITAR')) {
        const match = normalizedText.match(/QUITAR\s+(\d+)/);

        // Si el carrito está vacío, no tiene sentido intentar quitar
        if (cart.items.length === 0) {
            await enviarTexto(userId, "Tu carrito ya está vacío. 🛒", auth);
            await updateCart(userId, businessId, { conversationState: 'INICIO' });
            return true;
        }

        if (match) {
            await handleRemoveItem(userId, businessId, match[1], cart, auth);
        } else {
            await updateCart(userId, businessId, { conversationState: 'WAITING_FOR_REMOVAL' });
            await enviarTexto(userId, "¿Qué número de producto desea quitar? (Ej: *1*)", auth);
        }
        return true;
    }

    if (normalizedText === 'FINALIZAR' || normalizedText === 'PAGAR') {
        if (!cart.items || cart.items.length === 0) {
            await enviarTexto(userId, "Su carrito está vacío. 🛒", auth);
            return true;
        }
        await ejecutarCheckoutInteligente(userId, businessId, cart, auth, restaurante);
        return true;
    }
    return false;
};

// --- PORTERO NIVEL 2: IA (VERSION PROCESADOR DE INTENCIONES) ---
async function handleAICheck(userId, text, cart, businessId, auth, restauranteConfig) {
    try {
        const history = cart.tempData.history || [];
        const lastProduct = cart.tempData.lastProductDiscussed || null;

        const aiResponse = await analizarPedidoConIA(text, businessId, history, restauranteConfig, lastProduct); 

        console.log("-----------------------------------------");
        logger.info(`[DEBUG IA] Respuesta Mateo: ${JSON.stringify(aiResponse, null, 2)}`);
        console.log("-----------------------------------------");

        const limpiar = (val) => (val && val !== 'null' && val !== 'undefined' && val !== '') ? val.trim() : null;

        // 1. CAPTURA DE DATOS LOGÍSTICOS
        if (aiResponse.extractedData) {
            const { nombre, direccion, metodoPago, modoEntrega, notasPago, notasCocina } = aiResponse.extractedData;
            const nLogistica = limpiar(notasPago);
            const nCocina = limpiar(notasCocina);
            const notasUnicas = new Set();
            if (nLogistica) notasUnicas.add(nLogistica);
            if (nCocina) notasUnicas.add(nCocina);
            const notasOrdenConsolidadas = Array.from(notasUnicas).join(' | ');

            const actualizaciones = {
                name: limpiar(nombre) || cart.tempData.name,
                address: limpiar(direccion) || cart.tempData.address,
                deliveryMode: limpiar(modoEntrega) || cart.tempData.deliveryMode,
                paymentMethod: metodoPago ? (metodoPago.charAt(0).toUpperCase() + metodoPago.slice(1).toLowerCase()) : cart.tempData.paymentMethod,
                orderNotes: notasOrdenConsolidadas || cart.tempData.orderNotes
            };

            await updateCart(userId, businessId, { tempData: { ...cart.tempData, ...actualizaciones } });
            cart.tempData = { ...cart.tempData, ...actualizaciones };
        }

        // 🌟 2. MANEJO DE ESTADOS (BLOQUEO INTELIGENTE)
        // Solo bloqueamos si el estado es negativo Y NO HAY ITEMS para procesar.
        const tieneItemsAI = aiResponse.items && aiResponse.items.length > 0;
        const esEstadoNegativo = ['AMBIGUO', 'INCOMPLETO', 'NO_DISPONIBLE'].includes(aiResponse.status);

        if (esEstadoNegativo && !tieneItemsAI) {    
            const updatedHistory = [...history, { role: "user", content: text }, { role: "assistant", content: aiResponse.waiterMessage }].slice(-6);
            await updateCart(userId, businessId, { tempData: { ...cart.tempData, history: updatedHistory } });
            await enviarTexto(userId, aiResponse.waiterMessage, auth);
            return "AI_HANDLED_STOP"; 
        }

        // 3. PROCESADOR DE ACCIONES (ADD vs REMOVE)
        const action = aiResponse.action || "ADD";

        if (action === "REMOVE") {
            // ... (Tu lógica de REMOVE se mantiene igual, ya que funciona bien)
            let itemsEnCarrito = [...cart.items];
            let borrados = [];
            for (const itemAI of aiResponse.items) {
                const idx = itemsEnCarrito.findIndex(i => i.nombre.toLowerCase().includes(itemAI.productName.toLowerCase()));
                if (idx > -1) {
                    const cantARemover = itemAI.quantity || 1;
                    const cantActual = itemsEnCarrito[idx].cantidad;
                    if (cantARemover >= cantActual) {
                        borrados.push(itemsEnCarrito[idx].nombre);
                        itemsEnCarrito.splice(idx, 1);
                    } else {
                        itemsEnCarrito[idx].cantidad -= cantARemover;
                        borrados.push(`${cantARemover} ${itemsEnCarrito[idx].nombre}`);
                    }
                }
            }
            if (borrados.length > 0) {
                const carritoVacio = itemsEnCarrito.length === 0;
                await updateCart(userId, businessId, { items: itemsEnCarrito, conversationState: carritoVacio ? 'INICIO' : cart.conversationState, tempData: carritoVacio ? { ...cart.tempData, history: [] } : cart.tempData });
                await enviarTexto(userId, `✅ He quitado: *${borrados.join(', ')}*.`, auth);
                if (carritoVacio) await enviarTexto(userId, "🛒 Tu carrito ahora está vacío. ¿Quieres ver el *MENÚ*? 🍕", auth);
                else await sendCartSummary(userId, { ...cart, items: itemsEnCarrito }, businessId, auth);
                return "AI_REMOVE_SUCCESS";
            }
            return "AI_REMOVE_FAIL";

        } else {
            // --- ACCIÓN: ADD (CON MANEJO DE ÉXITO PARCIAL) ---
            const itemsValidados = await validarPedido(aiResponse.items, businessId);

            // Si después de validar no quedó nada (Ej: solo pidió la Prohibida)
            if (!itemsValidados || itemsValidados.length === 0) {
                await enviarTexto(userId, `${aiResponse.waiterMessage}\n\n👉 Escribe *MENÚ* para ver lo disponible.`, auth);
                await updateCart(userId, businessId, { tempData: { ...cart.tempData, lastProductDiscussed: null } });
                return "NO_MATCH";
            }

            // 🌟 Si había una advertencia (NO_DISPONIBLE) pero sí hay items válidos:
            if (esEstadoNegativo) {
                await enviarTexto(userId, aiResponse.waiterMessage, auth);
            }

            // Agregamos lo válido al carrito
            for (const item of itemsValidados) {
                await addItemToCart(userId, businessId, item);
            }

            const updatedHistory = [...history, { role: "user", content: text }, { role: "assistant", content: aiResponse.waiterMessage }].slice(-6);
            
            // LÓGICA FAST-TRACK
            const { name, paymentMethod, deliveryMode, address } = cart.tempData;
            const pedidoListo = !!(name && paymentMethod && deliveryMode && (deliveryMode === 'PICKUP' || address));

            if (pedidoListo) {
                await updateCart(userId, businessId, { 
                    tempData: { ...cart.tempData, history: updatedHistory, lastProductDiscussed: itemsValidados[0].nombre },
                    conversationState: 'CONFIRMANDO_PEDIDO' 
                });
                await enviarTexto(userId, `✅ *¡Todo listo!* Ya tengo tus datos.\n👉 Escribe *CONFIRMAR* para pedir ya o *CARRITO* para revisar.`, auth);
                return "AI_SUCCESS_FAST_TRACK";
            } else {
                // Si no fue un estado negativo (fue un éxito total), enviamos el mensaje de la IA
                if (!esEstadoNegativo) {
                    await enviarTexto(userId, `${aiResponse.waiterMessage}`, auth);
                }
                
                await updateCart(userId, businessId, { 
                    tempData: { ...cart.tempData, history: updatedHistory, lastProductDiscussed: itemsValidados[0].nombre } 
                });
                await enviarTexto(userId, "Escribe *CARRITO* para revisar o sigue pidiendo.", auth);
                return "AI_SUCCESS";
            }
        }
    } catch (e) {
        logger.error('Error IA:', e);
        return "ERROR";
    }
}

// --- WEBHOOK POST ---
router.post('/webhook', async (req, res) => {
    try {
        const value = req.body.entry?.[0]?.changes?.[0]?.value;
        const messageObject = value?.messages?.[0];
        if (!messageObject) return res.sendStatus(200);
        
        const userId = messageObject.from;
        const restaurante = await Restaurante.findOne({ whatsappPhoneId: value.metadata.phone_number_id });
        if (!restaurante) return res.sendStatus(200);

        const auth = { token: restaurante.whatsappToken, phoneId: restaurante.whatsappPhoneId };
        const businessId = restaurante._id;
        let cart = await getOrCreateCart(userId, businessId);

        // 1. INTERACTIVOS (Botones)
        if (messageObject.type === 'interactive') {
            const actionId = messageObject.interactive.button_reply?.id;
            if (actionId?.startsWith('MODE_')) {
                cart.tempData.deliveryMode = actionId === 'MODE_DELIVERY' ? 'DELIVERY' : 'PICKUP';
                await updateCart(userId, businessId, { tempData: cart.tempData });
                await ejecutarCheckoutInteligente(userId, businessId, cart, auth, restaurante);
                return res.sendStatus(200);
            }
            if (actionId?.startsWith('PAYMENT_')) {
                const method = actionId.replace('PAYMENT_', '').replace(/_/g, ' ');
                cart.tempData.paymentMethod = method.charAt(0).toUpperCase() + method.slice(1).toLowerCase();
                await updateCart(userId, businessId, { tempData: cart.tempData });
                await ejecutarCheckoutInteligente(userId, businessId, cart, auth, restaurante);
                return res.sendStatus(200);
            }
        }

        // 2. GPS
        if (messageObject.type === 'location') {
            const { latitude, longitude } = messageObject.location;
            cart.tempData.address = `https://www.google.com/maps?q=${latitude},${longitude}`;
            await updateCart(userId, businessId, { tempData: cart.tempData });
            await enviarTexto(userId, "📍 Ubicación guardada.", auth);
            await ejecutarCheckoutInteligente(userId, businessId, cart, auth, restaurante);
            return res.sendStatus(200);
        }

        // 3. TEXTO
        const text = (messageObject.text?.body || '').trim();
        const normalizedText = text.toUpperCase();

        if (normalizedText === 'CONFIRMAR' && cart.conversationState === 'CONFIRMANDO_PEDIDO') {
            const financieros = calcularTotalesFinales(cart.items, cart.tempData.deliveryMode, restaurante);
            await processFinalOrder(userId, cart, businessId, auth, financieros);
            return res.sendStatus(200);
        }

        if (await manejarPorteroNivel1(text, userId, businessId, auth, cart, restaurante)) return res.sendStatus(200);

        // 4. CAPTURA POR ESTADO (FSM)
        if (cart.conversationState === 'PREGUNTANDO_NOMBRE') {
            cart.tempData.name = text.toLowerCase().replace(/\b\w/g, l => l.toUpperCase());
            await updateCart(userId, businessId, { tempData: cart.tempData });
            await ejecutarCheckoutInteligente(userId, businessId, cart, auth, restaurante);
            return res.sendStatus(200);
        }

        if (cart.conversationState === 'PREGUNTANDO_DIRECCION') {
            cart.tempData.address = text;
            await updateCart(userId, businessId, { tempData: cart.tempData });
            await ejecutarCheckoutInteligente(userId, businessId, cart, auth, restaurante);
            return res.sendStatus(200);
        }

        if (cart.conversationState === 'CONFIRMANDO_PEDIDO') {
            await enviarTexto(userId, "Tu pedido está listo para confirmar. Escribe *CONFIRMAR* o *QUITAR* para hacer cambios.", auth);
            return res.sendStatus(200);
        }

        // INTERCEPTOR DE CIERRE
        const frasesCierre = ['NO', 'NADA MAS', 'ES TODO', 'NO GRACIAS', 'NADA MÁS', 'POR AHORA NO'];
        if (frasesCierre.includes(normalizedText) && cart.items.length > 0) {
            await ejecutarCheckoutInteligente(userId, businessId, cart, auth, restaurante);
            return res.sendStatus(200);
        }

        // 5. LLAMADA FINAL A IA
        await handleAICheck(userId, text, cart, businessId, auth, restaurante.configuracion);
        res.sendStatus(200);

    } catch (error) {
        logger.error('Error catastrófico:', error);
        res.sendStatus(500);
    }
});

router.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "roman123"; 
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        return res.status(200).send(challenge);
    }
    res.sendStatus(403);
});

export default router;