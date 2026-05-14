// src/workers/orderWorker.js
import { Worker } from 'bullmq';
import Pedido from '../models/Pedido.js';
import Restaurante from '../models/Restaurante.js';
import MenuItem from '../models/MenuItem.js';
import { connection } from '../config/redis.js';

// Capa de Servicios Modulares
import { getIntention } from '../services/aiService.js';
import { applyInference } from '../services/businessRules.js';
import { processCartActions } from '../services/cartService.js';
import { notifyDashboard, sendWhatsAppNotification } from '../services/notifyService.js';
import { handleInitialFlow } from '../services/flowService.js'; 

// Capa de Utilidades
import { getOrCreateCart, updateCart, removeItemsByName, addItemToCart } from '../whatsapp/cartUtils.js';
import { sendMenu, sendCartSummary, sendPaymentMethodOptions } from '../whatsapp/utils.js';
import { calcularTotalesFinales, validarPedido } from '../services/orderValidator.js';
import { processFinalOrder } from '../whatsapp/orderProcessor.js';
import { getUltimoPedido, generarPropuestaVIP } from '../services/loyaltyService.js';
import { calcularDistanciaKM } from '../utils/geoUtils.js';
import logger from '../utils/logger.js';

console.log("👷 [Worker] Sistema de orquestación BullMQ iniciado.");

// ==========================================
// --- HELPERS DE FLUJO ---
// ==========================================

const enviarBotonesContinuar = async (userId, bodyText, auth) => {
    const buttons = [
        { id: "BTN_CHECKOUT", title: "🚀 Ir a Pagar" },
        { id: "BTN_VER_QUITAR", title: "🛒 Ver Carrito" },
        { id: "MENU", title: "📋 Ver Menú" }
    ];
    await sendWhatsAppNotification(userId, {
        type: "interactive",
        interactive: {
            type: "button",
            body: { text: bodyText },
            action: { buttons: buttons.map(btn => ({ type: "reply", reply: { id: btn.id, title: btn.title } })) }
        }
    }, auth);
};

const ejecutarCheckoutInteligente = async (userId, businessId, cart, auth, restaurante) => {
    if (!cart.items || cart.items.length === 0) return await sendMenu(userId, businessId, auth, cart);
    const { tempData } = cart;

    if (!tempData.deliveryMode) {
        await updateCart(userId, businessId, { conversationState: 'PREGUNTANDO_MODO_ENTREGA' });
        return await sendWhatsAppNotification(userId, {
            type: "interactive",
            interactive: {
                type: "button",
                body: { text: "Excelente elección. 🍽️ ¿Cómo gustas recibir tu pedido?" },
                action: { buttons: [{ type: "reply", reply: { id: "MODE_DELIVERY", title: "A domicilio 🛵" } }, { type: "reply", reply: { id: "MODE_PICKUP", title: "Recoger en tienda 🛍️" } }] }
            }
        }, auth);
    }

    if (!tempData.name || tempData.name.length < 2) {
        await updateCart(userId, businessId, { conversationState: 'PREGUNTANDO_NOMBRE' });
        return await sendWhatsAppNotification(userId, "¡Perfecto! ¿A nombre de quién registro el pedido? 👤", auth);
    }

    if (tempData.deliveryMode === 'DELIVERY' && !tempData.address) {
        await updateCart(userId, businessId, { conversationState: 'PREGUNTANDO_DIRECCION' });
        return await sendWhatsAppNotification(userId, "Para el envío, ¿cuál es tu dirección exacta? (O envía tu ubicación 📍)", auth);
    }

    if (!tempData.paymentMethod) {
        await updateCart(userId, businessId, { conversationState: 'PREGUNTANDO_PAGO' });
        return await sendPaymentMethodOptions(userId, businessId, auth);
    }

    await updateCart(userId, businessId, { conversationState: 'CONFIRMANDO_PEDIDO' });
    await sendCartSummary(userId, cart, businessId, auth);
};

// ==========================================
// --- EL WORKER ---
// ==========================================

const orderWorker = new Worker('order-processing', async job => {
    // 🌟 Sincronización de Job Name con Source
    const source = job.name; 
    const { businessId, auth, userId, messageObject, restauranteConfig } = job.data;
    
    console.log(`\n🔥 [Worker] Tarea recibida: ${source} | ID: ${job.id}`);

    try {
        if (source === 'WHATSAPP') {
            const restaurante = await Restaurante.findById(businessId).lean();
            let cart = await getOrCreateCart(userId, businessId);

            // --- 1. MANEJO DE INTERACTIVOS ---
            if (messageObject.type === 'interactive') {
                const actionId = messageObject.interactive.button_reply?.id || messageObject.interactive.list_reply?.id;

                if (actionId === 'REPETIR_PEDIDO') {
                    const ultimo = await getUltimoPedido(userId, businessId);
                    if (ultimo) {
                        let itemsFallidos = [];
                        for (const item of ultimo.items) {
                            const res = await addItemToCart(userId, businessId, { itemId: item.itemId, quantity: item.cantidad, opcionesSeleccionadas: item.opcionesSeleccionadas || [], notas: item.notas || "" });
                            if (!res.success) itemsFallidos.push(item.nombre);
                        }
                        await updateCart(userId, businessId, { conversationState: 'PROPUESTA_VIP', tempData: { ...cart.tempData, name: ultimo.nombreCliente, address: ultimo.direccionEntrega, deliveryMode: ultimo.entregaMode, paymentMethod: ultimo.metodoPago } });
                        cart = await getOrCreateCart(userId, businessId);
                        const msg = itemsFallidos.length > 0 ? `Pedido cargado parcial (sin stock de: ${itemsFallidos.join(', ')}).` : `¡Listo! Pedido anterior cargado.`;
                        return await sendWhatsAppNotification(userId, { type: "interactive", interactive: { type: "button", body: { text: `${msg}\n\n¿Confirmamos?` }, action: { buttons: [{ type: "reply", reply: { id: "VIP_CONFIRMAR_TODO", title: "✅ Todo igual" } }, { type: "reply", reply: { id: "VIP_CAMBIAR_DATOS", title: "✏️ Cambiar algo" } }, { type: "reply", reply: { id: "MENU", title: "📋 Ver Menú" } }] } } }, auth);
                    }
                }

                if (actionId === 'VIP_CONFIRMAR_TODO' || actionId === 'BTN_CHECKOUT') return await ejecutarCheckoutInteligente(userId, businessId, cart, auth, restaurante);
                if (actionId === 'MENU') return await sendMenu(userId, businessId, auth, cart);
                if (actionId === 'CARRITO' || actionId === 'BTN_VER_QUITAR') return await sendCartSummary(userId, cart, businessId, auth);

                if (actionId === 'BTN_CONFIRMAR_FINAL') {
                    const financieros = calcularTotalesFinales(cart.items, cart.tempData.deliveryMode, restaurante);
                    const pedidoFinal = await processFinalOrder(userId, cart, businessId, auth, financieros);
                    if (pedidoFinal) notifyDashboard(businessId, pedidoFinal);
                    return;
                }

                if (actionId?.startsWith('REMOVE_IDX_')) {
                    const index = parseInt(actionId.split('_')[2]);
                    const removedName = cart.items[index]?.nombre;
                    await removeItemsByName(userId, businessId, removedName);
                    await sendWhatsAppNotification(userId, `✅ Eliminado: *${removedName}*`, auth);
                    const updatedCart = await getOrCreateCart(userId, businessId);
                    return await sendCartSummary(userId, updatedCart, businessId, auth);
                }

                if (actionId?.startsWith('MODE_')) cart.tempData.deliveryMode = actionId === 'MODE_DELIVERY' ? 'DELIVERY' : 'PICKUP';
                if (actionId?.startsWith('PAYMENT_')) cart.tempData.paymentMethod = actionId.replace('PAYMENT_', '').replace(/_/g, ' ');

                await updateCart(userId, businessId, { tempData: cart.tempData });
                return await ejecutarCheckoutInteligente(userId, businessId, cart, auth, restaurante);
            }

            // --- 2. UBICACIÓN GPS ---
            else if (messageObject.type === 'location') {
                const { latitude, longitude } = messageObject.location;
                const [restLat, restLon] = restaurante.configuracion.ubicacionLocal?.split(',').map(Number) || [0, 0];
                const distancia = calcularDistanciaKM(latitude, longitude, restLat, restLon);
                const addr = `https://www.google.com/maps?q=${latitude},${longitude}`;

                if (distancia > 5) {
                    await sendWhatsAppNotification(userId, `📍 Estás a ${distancia.toFixed(1)}km. Marcado para *Recoger en Tienda* 🛍️`, auth);
                    await updateCart(userId, businessId, { tempData: { ...cart.tempData, deliveryMode: 'PICKUP', address: addr } });
                } else {
                    await sendWhatsAppNotification(userId, "📍 Ubicación guardada para envío. 🛵", auth);
                    await updateCart(userId, businessId, { tempData: { ...cart.tempData, deliveryMode: 'DELIVERY', address: addr } });
                }
                cart = await getOrCreateCart(userId, businessId);
                return await ejecutarCheckoutInteligente(userId, businessId, cart, auth, restaurante);
            }

            // --- 3. TEXTO / IA ---
// --- 2. MANEJO DE TEXTO / IA ---
            else {
                const text = (messageObject.text?.body || '').trim();
                const history = cart.tempData.history || [];

                // 🌟 1. EL PORTERO (Servicio Flow)
                // Este servicio maneja: Saludos, Propuesta VIP, Menú y Mensajes de cortesía ($0 IA).
                const flujoManejado = await handleInitialFlow(userId, businessId, text, cart, auth);
                
                if (flujoManejado) {
                    return; // Si el portero respondió, aquí termina nuestro trabajo.
                }

                // 🌟 2. CAPTURA DE DATOS FSM (Nombre / Dirección)
                // Solo si el cliente ya está en medio de un proceso de checkout.
                if (cart.conversationState === 'PREGUNTANDO_NOMBRE' || cart.conversationState === 'PREGUNTANDO_DIRECCION') {
                    const field = cart.conversationState === 'PREGUNTANDO_NOMBRE' ? 'name' : 'address';
                    await updateCart(userId, businessId, { 
                        tempData: { ...cart.tempData, [field]: text }, 
                        conversationState: 'MOSTRANDO_MENU' 
                    });
                    const updatedCart = await getOrCreateCart(userId, businessId);
                    return await ejecutarCheckoutInteligente(userId, businessId, updatedCart, auth, restaurante);
                }

                // 🌟 3. PROCESAMIENTO CON IA (MATEO)
                // Si llegamos aquí es porque no es un saludo y no estamos capturando datos fijos.
                console.log("[Worker] Mensaje complejo. Consultando a Mateo IA...");
                
                const context = { 
                    businessId, restauranteConfig, history, 
                    menuMap: cart.tempData.menuMap || [], 
                    lastProductDiscussed: cart.tempData.lastProductDiscussed 
                };

                // Llamada al servicio de IA
                const aiResponse = await getIntention(text, context);
                
                // Aplicar reglas de inferencia (Dirección, pago, entrega)
                const updatedData = applyInference(aiResponse.extractedData, cart.tempData);
                await updateCart(userId, businessId, { tempData: updatedData });

                // Ejecutar acciones en el carrito (Añadir/Quitar con validación de stock)
                const { cart: finalCart, alerts } = await processCartActions(userId, businessId, aiResponse.items);
                
                let mensajeFinal = aiResponse.waiterMessage + (alerts ? `\n\n${alerts}` : "");

                // Guardar memoria de la conversación
                await updateCart(userId, businessId, {
                    tempData: {
                        ...updatedData,
                        history: [...history, { role: "user", content: text }, { role: "assistant", content: mensajeFinal }].slice(-6),
                        lastProductDiscussed: aiResponse.items?.[0]?.productName || context.lastProductDiscussed
                    }
                });

                // Responder con la confirmación de la IA y botones de acción
                return await enviarBotonesContinuar(userId, mensajeFinal, auth);
            }
        }
        
        // --- 4. FLUJO DIRECTO (DASHBOARD) ---
        if (source === 'DIRECTO') {
            const { items, tempData, businessId: bId } = job.data;
            const itemIds = items.map(i => i.itemId);
            const productosDB = await MenuItem.find({ _id: { $in: itemIds }, businessId: bId }).lean();
            
            const itemsValidados = items.map(i => {
                const p = productosDB.find(prod => prod._id.toString() === i.itemId.toString());
                return p ? { itemId: p._id, nombre: p.nombre, precioUnitario: i.precioUnitario, cantidad: i.cantidad || 1, opcionesSeleccionadas: i.opcionesSeleccionadas || [], notas: i.notas || "" } : null;
            }).filter(Boolean);

            const subtotal = itemsValidados.reduce((acc, i) => acc + (i.precioUnitario * i.cantidad), 0);
            const pedidoDirecto = new Pedido({ businessId: bId, source: 'DIRECTO', nombreCliente: tempData.name || 'Caja', telefonoCliente: 'MOSTRADOR', clienteId: 'WALK-IN', direccionEntrega: tempData.address || 'TIENDA', items: itemsValidados, subtotal, costoEnvio: 0, total: subtotal, metodoPago: tempData.paymentMethod || 'Efectivo', entregaMode: 'PICKUP', estado: 'Confirmado' });
            
            await pedidoDirecto.save();
            await MenuItem.bulkWrite(itemsValidados.map(i => ({ updateOne: { filter: { _id: i.itemId }, update: { $inc: { vendidas_hoy: i.cantidad } } } })));
            notifyDashboard(bId, pedidoDirecto);
        }

    } catch (e) { console.error("❌ [Worker Error] Fallo crítico:", e.message); }
}, { connection });

orderWorker.on('completed', job => console.log(`✅ [Worker] Tarea completada: ${job.id}`));
export default orderWorker;