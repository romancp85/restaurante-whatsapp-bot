// src/workers/orderWorker.js
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import Pedido from '../models/Pedido.js';
import Restaurante from '../models/Restaurante.js';
import { getOrCreateCart, updateCart, addItemToCart, removeItemsByName } from '../whatsapp/cartUtils.js';
import { sendMessage, sendMenu, sendCartSummary, sendPaymentMethodOptions, formatPrice } from '../whatsapp/utils.js';
import { analizarPedidoConIA } from '../utils/aiUtils.js';
import { validarPedido, calcularTotalesFinales } from '../services/orderValidator.js';
import { processFinalOrder } from '../whatsapp/orderProcessor.js';
import { getUltimoPedido, generarPropuestaVIP } from '../services/loyaltyService.js';
import { calcularDistanciaKM } from '../utils/geoUtils.js';
import logger from '../utils/logger.js';

console.log("👷 [Worker] Inicializando sistema de escucha BullMQ...");

const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
    maxRetriesPerRequest: null
});

// ==========================================
// --- HELPERS DEL WORKER ---
// ==========================================

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
            action: { buttons: buttons.map(btn => ({ type: "reply", reply: { id: btn.id, title: btn.title } })) }
        }
    }, auth);
};

const enviarListaParaQuitar = async (userId, cart, auth) => {
    if (!cart.items || cart.items.length === 0) {
        return await sendMessage(userId, "Tu carrito está vacío. 🛒", auth);
    }
    const rows = cart.items.map((item, index) => ({
        id: `REMOVE_IDX_${index}`, 
        title: `Quitar ${item.nombre}`.substring(0, 24),
        description: `${item.cantidad}x - $${(item.precioUnitario * item.cantidad / 100).toFixed(2)}`.substring(0, 72)
    }));
    await sendMessage(userId, {
        type: "interactive",
        interactive: {
            type: "list",
            header: { type: "text", text: "Gestionar Carrito" },
            body: { text: "Selecciona el producto que deseas eliminar:" },
            footer: { text: "Toca para ver productos" },
            action: { button: "Ver Productos", sections: [{ title: "Tu Pedido Actual", rows }] }
        }
    }, auth);
};

const ejecutarCheckoutInteligente = async (userId, businessId, cart, auth, restaurante) => {
    if (!cart.items || cart.items.length === 0) {
        return await sendMenu(userId, businessId, auth, cart);
    }

    const { tempData } = cart;

    if (!tempData.deliveryMode) {
        await updateCart(userId, businessId, { conversationState: 'PREGUNTANDO_MODO_ENTREGA' });
        return await sendMessage(userId, {
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
    }

    if (!tempData.name || (tempData.name && tempData.name.length < 2)) {
        await updateCart(userId, businessId, { conversationState: 'PREGUNTANDO_NOMBRE' });
        return await sendMessage(userId, "¡Perfecto! ¿A nombre de quién registro el pedido? 👤", auth);
    }

    if (tempData.deliveryMode === 'DELIVERY' && !tempData.address) {
        await updateCart(userId, businessId, { conversationState: 'PREGUNTANDO_DIRECCION' });
        return await sendMessage(userId, "Para el envío, ¿cuál es tu dirección exacta? (O envía tu ubicación 📍)", auth);
    }

    if (!tempData.paymentMethod) {
        await updateCart(userId, businessId, { conversationState: 'PREGUNTANDO_PAGO' });
        return await sendPaymentMethodOptions(userId, businessId, auth);
    }

    await updateCart(userId, businessId, { conversationState: 'CONFIRMANDO_PEDIDO' });
    await sendCartSummary(userId, cart, businessId, auth);
};

// ==========================================
// --- EL WORKER MAESTRO ---
// ==========================================

const orderWorker = new Worker('order-processing', async job => {
    const { source, businessId, auth } = job.data;
    console.log(`\n🔥 [Worker] Tarea recibida: ${source} | Job ID: ${job.id}`);

    try {
        if (source === 'WHATSAPP') {
            const { userId, messageObject, restauranteConfig } = job.data;
            const restaurante = await Restaurante.findById(businessId).lean();
            let cart = await getOrCreateCart(userId, businessId);

            // --- 1. MANEJO DE INTERACTIVOS ---
            if (messageObject.type === 'interactive') {
                const actionId = messageObject.interactive.button_reply?.id || messageObject.interactive.list_reply?.id;

// src/workers/orderWorker.js -> Dentro de REPETIR_PEDIDO

                if (actionId === 'REPETIR_PEDIDO') {
                    const ultimo = await getUltimoPedido(userId, businessId);
                    if (ultimo) {
                        console.log("-> Procesando Re-order VIP con validación de stock...");
                        
                        let itemsCargados = 0;
                        let itemsFallidos = [];

                        for (const item of ultimo.items) {
                            const res = await addItemToCart(userId, businessId, {
                                itemId: item.itemId, quantity: item.cantidad,
                                opcionesSeleccionadas: item.opcionesSeleccionadas || [], notas: item.notas || ""
                            });
                            if (res.success) itemsCargados++; else itemsFallidos.push(item.nombre);
                        }

                        // 🌟 MEJORA: Si no hay nada de stock, enviamos botón de menú en lugar de solo texto
                        if (itemsCargados === 0) {
                            return await sendMessage(userId, {
                                type: "interactive",
                                interactive: {
                                    type: "button",
                                    body: { text: "💔 Lo sentimos, los productos de tu pedido anterior ya no están disponibles por hoy. ¿Te gustaría ver qué más tenemos en el menú?" },
                                    action: {
                                        buttons: [
                                            { type: "reply", reply: { id: "MENU", title: "📋 Ver Menú" } }
                                        ]
                                    }
                                }
                            }, auth);
                        }

                        // Si hay algunos productos pero otros no
                        const msgVip = itemsFallidos.length > 0 
                            ? `He cargado tu pedido, excepto: *${itemsFallidos.join(', ')}* (sin stock). ¿Confirmamos lo demás?`
                            : `¡Listo! Cargué tu pedido anterior completo. ¿Confirmamos los datos?`;

                        await updateCart(userId, businessId, { conversationState: 'PROPUESTA_VIP' });
                        cart = await getOrCreateCart(userId, businessId);

                        return await sendMessage(userId, {
                            type: "interactive",
                            interactive: {
                                type: "button",
                                body: { text: msgVip },
                                action: {
                                    buttons: [
                                        { type: "reply", reply: { id: "VIP_CONFIRMAR_TODO", title: "✅ Sí, adelante" } },
                                        { type: "reply", reply: { id: "MENU", title: "📋 Ver Menú" } }
                                    ]
                                }
                            }
                        }, auth);
                    }
                }

                if (actionId === 'VIP_CONFIRMAR_TODO') return await ejecutarCheckoutInteligente(userId, businessId, cart, auth, restaurante);
                
                if (actionId === 'VIP_CAMBIAR_DATOS' || actionId === 'MENU_NUEVO') {
                    await updateCart(userId, businessId, { 
                        conversationState: actionId === 'MENU_NUEVO' ? 'MOSTRANDO_MENU' : cart.conversationState,
                        tempData: { ...cart.tempData, deliveryMode: null, address: null, paymentMethod: null } 
                    });
                    cart = await getOrCreateCart(userId, businessId);
                    if (actionId === 'MENU_NUEVO') return await sendMenu(userId, businessId, auth, cart);
                    return await ejecutarCheckoutInteligente(userId, businessId, cart, auth, restaurante);
                }

                if (actionId === 'BTN_LANZAR_LISTA_QUITAR') return await enviarListaParaQuitar(userId, cart, auth);
                if (actionId === 'BTN_CHECKOUT') return await ejecutarCheckoutInteligente(userId, businessId, cart, auth, restaurante);
                if (actionId === 'BTN_VER_QUITAR' || actionId === 'CARRITO' || actionId === 'MENU') {
                    if (actionId === 'MENU') {
                         await updateCart(userId, businessId, { tempData: { ...cart.tempData, deliveryMode: null, address: null, paymentMethod: null } });
                         return await sendMenu(userId, businessId, auth, cart);
                    }
                    return await sendCartSummary(userId, cart, businessId, auth);
                }
                
                if (actionId === 'BTN_CONFIRMAR_FINAL') {
                    const financieros = calcularTotalesFinales(cart.items, cart.tempData.deliveryMode, restaurante);
                    const pedidoFinal = await processFinalOrder(userId, cart, businessId, auth, financieros);
                    if (pedidoFinal && global.io) {
                        const salaId = businessId.toString();
                        global.io.to(salaId).emit('NUEVO_PEDIDO', JSON.parse(JSON.stringify(pedidoFinal)));
                    }
                    return;
                }

                if (actionId?.startsWith('REMOVE_IDX_')) {
                    const index = parseInt(actionId.split('_')[2]);
                    const removedName = cart.items[index]?.nombre;
                    await removeItemsByName(userId, businessId, removedName);
                    await sendMessage(userId, `✅ Eliminado: *${removedName}*`, auth);
                    const updatedCart = await getOrCreateCart(userId, businessId);
                    if (updatedCart.items.length === 0) {
                        return await sendMessage(userId, {
                            type: "interactive",
                            interactive: {
                                type: "button",
                                body: { text: "🛒 Carrito vacío. ¿Quieres ver el menú?" },
                                action: { buttons: [{ type: "reply", reply: { id: "MENU", title: "📋 Ver Menú" } }] }
                            }
                        }, auth);
                    }
                    return await sendCartSummary(userId, updatedCart, businessId, auth);
                }

                if (actionId?.startsWith('MODE_')) cart.tempData.deliveryMode = (actionId === 'MODE_DELIVERY' ? 'DELIVERY' : 'PICKUP');
                if (actionId?.startsWith('PAYMENT_')) cart.tempData.paymentMethod = actionId.replace('PAYMENT_', '').replace(/_/g, ' ');

                await updateCart(userId, businessId, { tempData: cart.tempData });
                return await ejecutarCheckoutInteligente(userId, businessId, cart, auth, restaurante);
            }

            // --- 2. MANEJO DE TEXTO / IA ---
else {
                const text = (messageObject.text?.body || '').trim();
                const normalizedText = text.toUpperCase();
                const history = cart.tempData.history || [];

                // 🌟 1. DETECCIÓN DE SALUDO O INICIO
                const saludos = ['HOLA', 'OLA', 'GOLA', 'BUENAS', 'BUENOS', 'DIAS', 'TARDES', 'NOCHES', 'INFO', 'ESTAN', 'VENDIENDO', 'MENU', 'MENÚ', 'HAY'];
                const esSaludo = saludos.some(s => normalizedText.includes(s));

                if (cart.items.length === 0 && history.length === 0 && (text.length < 10 || (esSaludo && text.length < 25))) {
                    console.log("-> Comienzo de sesión detectado. Buscando historial VIP...");
                    const ultimo = await getUltimoPedido(userId, businessId);
                    const propuesta = generarPropuestaVIP(ultimo);

                    if (propuesta && cart.conversationState !== 'PROPUESTA_VIP') {
                        await updateCart(userId, businessId, { conversationState: 'PROPUESTA_VIP' });
                        return await sendMessage(userId, {
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
                    }
                    return await sendMenu(userId, businessId, auth, cart);
                }

                // 🌟 2. CAPTURA DE DATOS (FSM)
                if (cart.conversationState === 'PREGUNTANDO_NOMBRE') {
                    await updateCart(userId, businessId, { tempData: { ...cart.tempData, name: text }, conversationState: 'MOSTRANDO_MENU' });
                    const updatedCart = await getOrCreateCart(userId, businessId);
                    return await ejecutarCheckoutInteligente(userId, businessId, updatedCart, auth, restaurante);
                }

                if (cart.conversationState === 'PREGUNTANDO_DIRECCION') {
                    await updateCart(userId, businessId, { tempData: { ...cart.tempData, address: text }, conversationState: 'MOSTRANDO_MENU' });
                    const updatedCart = await getOrCreateCart(userId, businessId);
                    return await ejecutarCheckoutInteligente(userId, businessId, updatedCart, auth, restaurante);
                }

                // 🌟 3. TRADUCTOR DE ÍNDICES (Solo corre si vamos a ir a la IA)
                let textoParaIA = text;
                const menuMap = cart.tempData.menuMap || [];
                if (menuMap.length > 0) {
                    // Ordenamos de mayor a menor para no romper números compuestos (ej: 12 antes que 1)
                    const mapOrdenado = [...menuMap].sort((a, b) => b.index - a.index);

                    mapOrdenado.forEach(item => {
                        /**
                         * 🔍 EXPLICACIÓN DE LA NUEVA REGEX:
                         * Buscamos el número solo si tiene un prefijo de 'índice' mandatory.
                         * Acepta: "la 7", "el 7", "del 7", "#7", "n7", "numero 7"
                         * NO acepta: "2 " (suelto), porque eso suele ser una cantidad.
                         */
                        const regexIndex = new RegExp(`\\b(la|el|del|n\\.?|#|numero|posicion)\\s*${item.index}\\b`, 'gi');
                        
                        // CASO ESPECIAL: Si el mensaje es SOLO el número (ej: el usuario solo escribió "7")
                        const esSoloNumero = text.trim() === item.index.toString();

                        if (regexIndex.test(textoParaIA) || esSoloNumero) {
                            console.log(`[Traductor] Identificado índice ${item.index} como "${item.nombre}"`);
                            
                            if (esSoloNumero) {
                                textoParaIA = item.nombre;
                            } else {
                                // Reemplazamos "la 7" por "Pizza Margarita"
                                textoParaIA = textoParaIA.replace(regexIndex, ` ${item.nombre} `);
                            }
                        }
                    });
                }

                console.log(`-> Mensaje para Mateo: "${textoParaIA.trim()}"`);
                const aiResponse = await analizarPedidoConIA(textoParaIA, businessId, history, restauranteConfig, cart.tempData.lastProductDiscussed, menuMap);

                // --- A. EXTRAER DATOS (Inferencia) ---
                if (aiResponse.extractedData) {
                    const { nombre, direccion, metodoPago, modoEntrega, notasPago, notasCocina } = aiResponse.extractedData;
                    const limpiar = (val) => (val && val !== 'null' && val !== 'undefined') ? val.trim() : null;
                    const dirLimpia = limpiar(direccion);
                    let modoLimpio = limpiar(modoEntrega);
                    let pagoLimpio = limpiar(metodoPago);
                    
                    if (dirLimpia && !modoLimpio) modoLimpio = 'DELIVERY';
                    const notas = [limpiar(notasPago), limpiar(notasCocina)].filter(Boolean).join(' ').toLowerCase();
                    if (!pagoLimpio) {
                        if (notas.includes('billete') || notas.includes('cambio') || notas.includes('efectivo')) pagoLimpio = 'Efectivo';
                        else if (notas.includes('tarjeta') || notas.includes('terminal')) pagoLimpio = 'Tarjeta';
                    }

                    const updates = {
                        name: limpiar(nombre) || cart.tempData.name,
                        address: dirLimpia || cart.tempData.address,
                        deliveryMode: modoLimpio || cart.tempData.deliveryMode,
                        paymentMethod: pagoLimpio ? (pagoLimpio.charAt(0).toUpperCase() + pagoLimpio.slice(1).toLowerCase()) : cart.tempData.paymentMethod,
                        orderNotes: notas || cart.tempData.orderNotes
                    };
                    await updateCart(userId, businessId, { tempData: { ...cart.tempData, ...updates } });
                    cart = await getOrCreateCart(userId, businessId);
                }

                // --- B. PROCESAR ITEMS (Stock) ---
                let aclaracionStock = "";
                if (aiResponse.items && aiResponse.items.length > 0) {
                    for (const item of aiResponse.items) {
                        if (item.action === 'REMOVE') await removeItemsByName(userId, businessId, item.productName);
                        else {
                            const { itemsValidados } = await validarPedido([item], businessId);
                            if (itemsValidados && itemsValidados.length > 0) {
                                const resStock = await addItemToCart(userId, businessId, itemsValidados[0]);
                                if (!resStock.success && resStock.reason === 'SIN_STOCK') {
                                    aclaracionStock += resStock.disponible > 0 
                                        ? `\n\n⚠️ *Nota:* De ${resStock.name} solo quedan ${resStock.disponible} unidades. Por ahora no lo agregué.` 
                                        : `\n\n⚠️ *Nota:* ${resStock.name} está agotado.`;
                                }
                            }
                        }
                    }
                    cart = await getOrCreateCart(userId, businessId);
                }

                // --- C. RESPUESTA Y MEMORIA ---
                let mensajeFinal = aiResponse.waiterMessage;
                if (aclaracionStock) mensajeFinal = `He procesado tu solicitud, pero hubo un detalle con el inventario:\n${aclaracionStock}`;

                const newHistory = [...history, { role: "user", content: text }, { role: "assistant", content: mensajeFinal }].slice(-6);
                await updateCart(userId, businessId, { 
                    tempData: { ...cart.tempData, history: newHistory, lastProductDiscussed: aiResponse.items?.[0]?.productName || cart.tempData.lastProductDiscussed } 
                });

                return await enviarBotonesContinuar(userId, mensajeFinal, auth);
            }
        }

        if (source === 'DIRECTO') {
            const { items, tempData, businessId } = job.data;
            const subtotal = items.reduce((acc, i) => acc + (i.precioUnitario * i.cantidad), 0);
            const pedidoDirecto = new Pedido({
                businessId, source: 'DIRECTO', nombreCliente: tempData.name,
                telefonoCliente: 'MOSTRADOR', clienteId: 'WALK-IN',
                direccionEntrega: tempData.address || 'RECOGIDA EN TIENDA',
                items, subtotal, costoEnvio: 0, total: subtotal,
                metodoPago: tempData.paymentMethod, entregaMode: tempData.deliveryMode, estado: 'Confirmado'
            });
            await pedidoDirecto.save();
            if (global.io) {
                const salaId = businessId.toString();
                global.io.to(salaId).emit('NUEVO_PEDIDO', JSON.parse(JSON.stringify(pedidoDirecto)));
            }
        }
    } catch (error) {
        console.error("❌ [Worker Error] Fallo al procesar:", error.message);
    }
}, { connection });

export default orderWorker;