// src/whatsapp/utils.js - VERSIÓN SQUARE BLINDADA (AUTO-DETECCIÓN DE PARÁMETROS)

import axios from 'axios';
import MenuItem from '../models/MenuItem.js';
import logger from '../utils/logger.js';
import dotenv from 'dotenv';
import { updateCart } from './cartUtils.js'; 
import { calcularTotalesFinales } from '../services/orderValidator.js';
import Restaurante from '../models/Restaurante.js';

dotenv.config();

/**
 * 1. FORMATEO FINANCIERO (Regla de Oro: Centavos)
 */
export const formatPrice = (value) => {
    const num = parseFloat(value);
    if (isNaN(num)) return "$0.00";
    return `$${(num / 100).toFixed(2)}`;
};

/**
 * 2. FUNCIÓN MAESTRA DE ENVÍO (INTELIGENTE Y AGNOSTICA AL ORDEN)
 * Esta función detecta automáticamente cuál parámetro es el teléfono y cuál es el token.
 */
export const sendMessage = async (arg1, arg2, arg3) => {
    let to, payload, auth;

    // LÓGICA DE AUTO-DETECCIÓN:
    // Si el primer argumento es un string (teléfono), el orden es (to, payload, auth)
    if (typeof arg1 === 'string') {
        to = arg1;
        payload = arg2;
        auth = arg3;
    } 
    // Si el primer argumento es un objeto (auth), el orden es (auth, to, payload)
    else {
        auth = arg1;
        to = arg2;
        payload = arg3;
    }

    // Extracción segura de credenciales
    const token = auth?.token || auth?.whatsappToken;
    const phoneId = auth?.phoneId || auth?.whatsappPhoneId || auth?.phoneNumberId;

    if (!token || !phoneId || !to) {
        logger.error(`[SaaS Error] Datos insuficientes para envío. To: ${to}, Token: ${token ? 'OK' : 'FALTA'}, PhoneId: ${phoneId ? 'OK' : 'FALTA'}`);
        return;
    }

    const url = `https://graph.facebook.com/v20.0/${phoneId}/messages`;
    
    // Normalización: si el payload es texto plano, lo envolvemos para Meta
    let finalPayload = (typeof payload === 'string') ? { type: "text", text: { body: payload } } : payload;

    const body = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: to,
        ...finalPayload 
    };

    try {
        await axios.post(url, body, {
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
        });
    } catch (error) {
        const detail = error.response?.data?.error || error.message;
        logger.error("[Meta API Error] " + JSON.stringify(detail));
    }
};

/**
 * 3. ENVÍO DE MENÚ DINÁMICO
 */
// src/whatsapp/utils.js -> Función sendMenu

export const sendMenu = async (to, businessId, auth, cart = null) => {
    try {
        const diaActual = new Date().getDay(); 
        const menuItems = await MenuItem.find({ 
            businessId, activo: true, disponible: true, diasDisponibles: diaActual 
        }).sort({ categoria: 1, nombre: 1 });

        if (menuItems.length === 0) {
            return await sendMessage(to, "Lo sentimos, hoy no tenemos productos disponibles. 😴", auth);
        }

        // 1. CONSTRUCCIÓN VISUAL DEL MENÚ
        let menuText = "✨ *NUESTRO MENÚ* ✨\n";
        menuText += "━━━━━━━━━━━━━━\n\n";

        let currentCategory = "";
        const menuMap = menuItems.map((item, index) => {
            const itemNumber = index + 1;
            
            // Separador de categoría elegante
            if (item.categoria !== currentCategory) {
                currentCategory = item.categoria;
                const emoji = getCategoryEmoji(currentCategory);
                menuText += `\n${emoji} *${currentCategory.toUpperCase()}*\n`;
            }

            menuText += `*${itemNumber}.* ${item.nombre} - _${formatPrice(item.precioBase)}_\n`;
            if (item.descripcion) menuText += `   └ ${item.descripcion}\n`;
            
            return { index: itemNumber, itemId: item._id, nombre: item.nombre };
        });
        
        menuText += "\n━━━━━━━━━━━━━━\n";
        menuText += "💡 *Tip:* Puedes pedir por nombre o número. \n_Ej: 'Quiero 2 de la 5 y una Coca'_";

        // 2. ENVÍO DEL CUERPO DEL MENÚ
        await sendMessage(to, menuText, auth); 

        // 2. 🌟 LÓGICA INTELIGENTE DE BOTONES
        // Solo enviamos los botones de Carrito/Pago si el carrito tiene productos
        if (cart && cart.items && cart.items.length > 0) {
            const interactivePayload = {
                type: "interactive",
                interactive: {
                    type: "button",
                    body: { text: "Tienes productos en tu carrito. ¿Qué prefieres hacer? 👇" },
                    action: {
                        buttons: [
                            { type: "reply", reply: { id: "BTN_VER_QUITAR", title: "🛒 Mi Carrito" } },
                            { type: "reply", reply: { id: "BTN_CHECKOUT", title: "🚀 Ir a Pagar" } }
                        ]
                    }
                }
            };
            await sendMessage(to, interactivePayload, auth);
        }

        // Guardamos el mapa en el carrito
        await updateCart(to, businessId, { tempData: { menuMap }, conversationState: 'MOSTRANDO_MENU' });

    } catch (error) {
        logger.error('Error en sendMenu:', error);
    }
};

// Helper simple para emojis
function getCategoryEmoji(cat) {
    const c = cat.toUpperCase();
    if (c.includes('HAMBUR')) return '🍔';
    if (c.includes('PIZZA')) return '🍕';
    if (c.includes('BEBIDA') || c.includes('TOMAR')) return '🥤';
    if (c.includes('POSTRE')) return '🍰';
    if (c.includes('PROMO')) return '🔥';
    return '📋';
}

/**
 * 4. RESUMEN DE CARRITO (Mantiene tu lógica Enterprise original)
 */
// src/whatsapp/utils.js -> sendCartSummary

export const sendCartSummary = async (to, cart, businessId, auth) => {
    try {
        if (!cart.items || cart.items.length === 0) {
            return await sendMessage(to, "🛒 Tu carrito está vacío. ¡Echa un vistazo al menú! 🍔", auth);
        }

        const { name, address, paymentMethod, deliveryMode } = cart.tempData;
        const restaurante = await Restaurante.findById(businessId).lean();

        // 1. Cálculo de autoridad financiera (Regla de Oro: Centavos)
        const { subtotal, envio, total, esPickup } = calcularTotalesFinales(
            cart.items, 
            deliveryMode, 
            restaurante
        );

        // 2. Construcción Visual del Cuerpo
        let summaryText = "📝 *RESUMEN DE TU PEDIDO*\n";
        summaryText += "━━━━━━━━━━━━━━\n\n";

        cart.items.forEach((item, index) => {
            const cantidad = item.cantidad || 1; 
            summaryText += `*${cantidad}x ${item.nombre}*\n`;
            
            // 🌟 LIMPIEZA TOP-TIER: Solo mostrar la nota si existe y no es el texto "null"
    if (item.notas && item.notas !== 'null' && item.notas.trim() !== "") {
        summaryText += `_Nota: ${item.notas}_\n`; 
    }

    if (item.opcionesSeleccionadas?.length > 0) {
        item.opcionesSeleccionadas.forEach(opt => {
            const precioExtra = opt.precioExtra > 0 ? ` (+${formatPrice(opt.precioExtra)})` : "";
            summaryText += `  + ${opt.opcionNombre}${precioExtra}\n`;
        });
    }
    summaryText += `Subtotal: ${formatPrice(item.precioUnitario * cantidad)}\n\n`;
        });
        
        summaryText += "━━━━━━━━━━━━━━\n";
        summaryText += `*Subtotal:* ${formatPrice(subtotal)}\n`;
        if (envio > 0 && !esPickup) summaryText += `*Envío:* ${formatPrice(envio)}\n`;
        summaryText += `*TOTAL:* ${formatPrice(total)}\n`;

        // 3. Sección de Logística y Pago (Solo se muestra lo que ya se capturó)
        if (name || deliveryMode || paymentMethod) {
            summaryText += "\n📍 *DATOS DE ENTREGA*";
            if (name) summaryText += `\n👤 *Cliente:* ${name}`;
            if (deliveryMode) summaryText += `\n🛵 *Modo:* ${deliveryMode === 'DELIVERY' ? 'A domicilio' : 'Recoger en tienda'}`;
            if (address && deliveryMode === 'DELIVERY') summaryText += `\n🏠 *Dirección:* ${address}`;
            if (paymentMethod) summaryText += `\n💳 *Pago:* ${paymentMethod}`;
        }

        // 4. Lógica de Botones (Máximo 3 según Meta API)
        // Un pedido está completo SOLO si tiene: Nombre, Pago, Modo y (si es Delivery) Dirección.
        const pedidoCompleto = !!(
            name && 
            paymentMethod && 
            deliveryMode && 
            (deliveryMode === 'PICKUP' || address)
        );

        let buttons = [];
        if (pedidoCompleto) {
            // Escenario: Todo listo para Confirmar
            buttons = [
                { id: "BTN_CONFIRMAR_FINAL", title: "✅ Confirmar Pedido" },
                { id: "BTN_LANZAR_LISTA_QUITAR", title: "🗑️ Quitar algo" },
                { id: "MENU", title: "📋 Ver Menú" }
            ];
            summaryText += "\n\n⚠️ *Revisa tus datos arriba.* Si todo es correcto, pulsa Confirmar.";
        } else {
            // Escenario: Faltan datos (Ir al Checkout Inteligente)
            buttons = [
                { id: "BTN_CHECKOUT", title: "🚀 Finalizar Pedido" },
                { id: "BTN_LANZAR_LISTA_QUITAR", title: "🗑️ Quitar algo" },
                { id: "MENU", title: "📋 Seguir Pidiendo" }
            ];
            summaryText += "\n\n👉 Pulsa *Finalizar Pedido* para completar tus datos de envío.";
        }

        // 5. Envío de Mensaje Interactivo Único
        await sendMessage(to, {
            type: "interactive",
            interactive: {
                type: "button",
                body: { text: summaryText },
                action: {
                    buttons: buttons.map(btn => ({
                        type: "reply",
                        reply: { id: btn.id, title: btn.title }
                    }))
                }
            }
        }, auth);

    } catch (error) {
        logger.error("Error crítico en sendCartSummary Enterprise:", error);
        // Fallback en caso de error para no dejar al usuario colgado
        await sendMessage(to, "Hubo un problema al generar el resumen, pero tu carrito está a salvo. Escribe *CARRITO* para reintentar.", auth);
    }
};

/**
 * 5. MÉTODOS DE PAGO DINÁMICOS
 */
// src/whatsapp/utils.js -> sendPaymentMethodOptions

export const sendPaymentMethodOptions = async (to, businessId, auth) => {
    try {
        // 1. Buscamos el restaurante y su configuración
        const restaurante = await Restaurante.findById(businessId).select('configuracion nombre').lean();
        
        if (!restaurante) {
            logger.error(`[SaaS Error] No se encontró el restaurante ${businessId} para cargar pagos.`);
            return await sendMessage(to, "Lo sentimos, hay un error en la configuración de pagos. Por favor, intenta más tarde.", auth);
        }

        // 2. Extraer métodos de pago (Probamos ambos nombres comunes en tu estructura)
        const methods = restaurante.configuracion?.metodosPago || 
                        restaurante.configuracion?.acceptedPaymentMethods || 
                        ['Efectivo'];

        // Debug para consola (Te dirá exactamente qué encontró)
        console.log(`[SaaS Debug] Métodos para ${restaurante.nombre}:`, methods);

        // 3. Crear botones (Máximo 3 por Meta API)
        const buttons = methods.slice(0, 3).map(method => {
            const cleanMethod = method.trim();
            return {
                type: "reply",
                reply: {
                    // ID único para el Webhook: PAYMENT_EFECTIVO, PAYMENT_TARJETA, etc.
                    id: `PAYMENT_${cleanMethod.toUpperCase().replace(/\s/g, '_')}`, 
                    title: cleanMethod 
                }
            };
        });
        
        const interactivePayload = {
            type: 'interactive',
            interactive: {
                type: 'button',
                body: { text: "*💳 Elige tu Método de Pago:*\n\n¿Cómo prefieres pagar tu pedido?" },
                action: { buttons }
            }
        };

        await sendMessage(to, interactivePayload, auth);
    } catch (error) {
        logger.error(`Error en sendPaymentMethodOptions SaaS:`, error);
        // Fallback de emergencia
        await sendMessage(to, "Por ahora solo aceptamos Efectivo. ¿Te parece bien?", auth);
    }
};