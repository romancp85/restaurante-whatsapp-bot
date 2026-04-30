// src/whatsapp/utils.js - VERSIÓN FINAL ESTABLE Y UNIVERSAL

import axios from 'axios';
import MenuItem from '../models/MenuItem.js';
import logger from '../utils/logger.js';
import dotenv from 'dotenv';
import { updateCart } from './cartUtils.js'; 
import { getAcceptedPaymentMethods } from '../services/paymentService.js'; 
import { getGlobalConfig } from '../services/configServiceDB.js'; 
import { calcularTotalesFinales } from '../services/orderValidator.js';
import Restaurante from '../models/Restaurante.js'; // Necesitamos el modelo para leer la config

dotenv.config();

const WABA_TOKEN = process.env.WHATSAPP_TOKEN;
const WABA_ID = process.env.WHATSAPP_PHONE_ID;

const API_URL = `https://graph.facebook.com/v19.0/${WABA_ID}/messages`;
const FALLBACK_DELIVERY_COST = 3000; // Costo de envío de emergencia en centavos

/**
 * Utilidad simple para formatear precios.
 * @param {number} priceInCents - Precio en centavos.
 * @returns {string} Precio formateado (ej: "$55.00").
 */
export const formatPrice = (value) => {
    const num = parseFloat(value);
    if (isNaN(num)) return "$0.00";
    // DIVIDIR ENTRE 100: 15000 centavos / 100 = $150.00
    return `$${(num / 100).toFixed(2)}`;
};

/**
 * Función auxiliar para obtener el costo de envío del documento global.
 */
const getDeliveryCost = async () => {
    try {
        const config = await getGlobalConfig();
        const cost = config.costoEnvioCents; 
        
        if (typeof cost === 'number' && cost >= 0) {
            return cost;
        }
        return FALLBACK_DELIVERY_COST;
    } catch (error) {
        logger.error("Error al obtener costo de envío para resumen. Usando fallback.", error);
        return FALLBACK_DELIVERY_COST;
    }
};

/**
 * Función genérica para enviar cualquier tipo de mensaje a WhatsApp.
 * Acepta: 1. Una cadena de texto (ej: "Hola")
 * 2. Un objeto de contenido estructurado (ej: { type: 'text', text: { body: '...' } })
 * @param {string} to - Número de teléfono del destinatario.
 * @param {string|object} content - Contenido del mensaje.
 */
/**
 * Envía un mensaje dinámico usando las credenciales del Restaurante.
 * @param {string} to - Teléfono del cliente.
 * @param {object|string} content - Cuerpo del mensaje.
 * @param {object} auth - Objeto con { token, phoneId } del restaurante.
 */
export const sendMessage = async (to, content, auth) => {
    // Priorizamos el token del restaurante (SaaS), si no hay, usamos el del .env
    const token = auth?.token || process.env.WHATSAPP_TOKEN;
    const phoneId = auth?.phoneId || process.env.WHATSAPP_PHONE_ID;
    
    const url = `https://graph.facebook.com/v20.0/${phoneId}/messages`; // Actualizado a v20.0

    const payload = typeof content === 'string'
        ? { type: 'text', text: { body: content } } 
        : content;

    try {
        await axios.post(url, {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: to,
            ...payload
        }, {
            headers: { 
                'Authorization': `Bearer ${token.trim()}`,
                'Content-Type': 'application/json'
            }
        });
    } catch (error) {
        // 🔍 DEBUG AVANZADO: Esto nos dirá el error real de Meta
        const errorData = error.response?.data;
        if (errorData) {
            logger.error(`[Meta API Error] Detalle: ${JSON.stringify(errorData, null, 2)}`);
        } else {
            logger.error(`[SaaS Error] Error de conexión: ${error.message}`);
        }
    }
};

/**
 * Formatea y envía el menú completo al cliente usando texto plano.
 * @param {string} to - Número de teléfono del destinatario.
 */
/**
 * Envía el menú filtrado por Restaurante y Disponibilidad.
 */
export const sendMenu = async (to, businessId, auth) => {
    try {
        const diaActual = new Date().getDay(); // 0-6

        // Dentro de sendMenu en utils.js
        const menuItems = await MenuItem.find({ 
            businessId, 
            activo: true, 
            disponible: true,
            diasDisponibles: diaActual 
        }).sort({ categoria: 1, nombre: 1 });

        console.log(`[Debug] Platos encontrados para ${businessId}: ${menuItems.length}`); // <--- Añade esto

        if (menuItems.length === 0) {
            return await sendMessage(to, "Lo sentimos, hoy no tenemos productos disponibles. 😴", auth);
        }

        let menuText = "*¡Bienvenido al Menú!* 🍔\n\n";
        let currentCategory = "";

        const menuMap = menuItems.map((item, index) => {
            const itemNumber = index + 1;
            if (item.categoria !== currentCategory) {
                currentCategory = item.categoria;
                menuText += `\n*-- ${currentCategory.toUpperCase()} --*\n`;
            }
            menuText += `[${itemNumber}] ${item.nombre} - ${formatPrice(item.precioBase)}\n`;
            if (item.descripcion) menuText += `   _${item.descripcion}_\n`;

            return { index: itemNumber, itemId: item._id, nombre: item.nombre };
        });
        
        menuText += "\n👉 *Responde con el número* del producto.\n👉 *CARRITO*: Ver pedido.\n👉 *FINALIZAR*: Pagar.";

        await sendMessage(to, menuText, auth); 
        
        // Guardamos el mapeo en el carrito para que Node sepa qué ID corresponde a cada número
        await updateCart(to, businessId, { 
            tempData: { menuMap: menuMap }, 
            conversationState: 'MOSTRANDO_MENU' 
        });

    } catch (error) {
        logger.error('Error en sendMenu SaaS:', error);
    }
};

/**
 * Formatea y envía el resumen del carrito de compras.
 * @param {string} to - Número de teléfono del destinatario.
 * @param {object} cart - El objeto del carrito de ShoppingCart.
 */
// 2. REEMPLAZA LA FUNCIÓN sendCartSummary POR ESTA:
// src/whatsapp/utils.js

export const sendCartSummary = async (to, cart, businessId, auth) => {
    if (!cart.items || cart.items.length === 0) {
        await sendMessage(to, "🛒 Tu carrito está vacío.", auth);
        return;
    }

    // 1. EXTRAER DATOS PARA VALIDACIÓN DE "PEDIDO COMPLETO"
    const { name, address, paymentMethod, deliveryMode } = cart.tempData;
    
    // Un pedido está completo si tiene Nombre, Pago, Modo y (si es delivery) Dirección.
    const pedidoCompleto = !!(
        name && 
        paymentMethod && 
        deliveryMode && 
        (deliveryMode === 'PICKUP' || address)
    );

    let summaryText = "*🛒 Tu Carrito:*\n\n";
    const restaurante = await Restaurante.findById(businessId).lean();

    const { subtotal, envio, total, esPickup } = calcularTotalesFinales(
        cart.items, 
        deliveryMode, 
        restaurante
    );

    // 2. LISTADO DE PRODUCTOS
    cart.items.forEach((item, index) => {
        const cantidad = item.cantidad || item.quantity || 1; 
        summaryText += `${index + 1}. *${item.nombre}* (x${cantidad})\n`;
        
        const totalExtras = item.opcionesSeleccionadas?.reduce((a, b) => a + b.precioExtra, 0) || 0;
        const precioBaseIndividual = item.precioUnitario - totalExtras;

        if (item.notas) summaryText += `   _Nota: ${item.notas}_\n`; 

        if (item.opcionesSeleccionadas?.length > 0) {
            item.opcionesSeleccionadas.forEach(opt => {
                const precioTexto = opt.precioExtra === 0 ? "" : ` (${formatPrice(opt.precioExtra)})`;
                summaryText += `   + ${opt.opcionNombre}${precioTexto}\n`;
            });
        }
        summaryText += `   *Subtotal: ${formatPrice(item.precioUnitario * cantidad)}*\n\n`;
    });
    
    // 3. TOTALES FINANCIEROS
    summaryText += `*Subtotal:* ${formatPrice(subtotal)}\n`;
    if (envio > 0 || !esPickup) summaryText += `*Envío:* ${formatPrice(envio)}\n`;
    summaryText += `*TOTAL: ${formatPrice(total)}*\n`;

    // 4. SECCIÓN DE DATOS CAPTURADOS (Confianza)
    if (name || address || paymentMethod) {
        summaryText += `\n──────────────\n*Datos de entrega:*`;
        if (name) summaryText += `\n👤 *Cliente:* ${name}`;
        if (deliveryMode) summaryText += `\n🛵 *Modo:* ${deliveryMode === 'DELIVERY' ? 'A domicilio' : 'Recoger en tienda'}`;
        if (address && deliveryMode === 'DELIVERY') summaryText += `\n📍 *Dirección:* ${address}`;
        if (paymentMethod) summaryText += `\n💳 *Pago:* ${paymentMethod}`;
    }

    summaryText += `\n──────────────\n`;
    
    // 5. FOOTER INTELIGENTE (ELIMINA REDUNDANCIA)
    if (pedidoCompleto || cart.conversationState === 'CONFIRMANDO_PEDIDO') {
        summaryText += "✅ *¡Todo listo!* Ya tenemos tus datos.\n👉 Escribe *CONFIRMAR* para enviar a cocina.";
        
        // Sincronizamos el estado de la conversación si no lo estaba
        if (cart.conversationState !== 'CONFIRMANDO_PEDIDO') {
            await updateCart(to, businessId, { conversationState: 'CONFIRMANDO_PEDIDO' });
        }
    } else {
        summaryText += "👉 *FINALIZAR*: Pagar pedido.\n👉 *QUITAR [X]*: Eliminar producto.";
    }

    await sendMessage(to, summaryText, auth);
};

/**
 * Envía un mensaje interactivo con botones para elegir el método de pago.
 * @param {string} to - Número de teléfono del destinatario.
 */

// Añade 'businessId' y 'auth' a los parámetros
export const sendPaymentMethodOptions = async (to, businessId, auth) => {
    try {
        // 🛑 Pasar businessId al servicio para traer los pagos de ese restaurante
        const config = await getGlobalConfig(businessId);
        const acceptedMethods = config.acceptedPaymentMethods || ['Efectivo'];
        
        const buttons = acceptedMethods.map(method => ({
            type: "reply",
            reply: {
                id: `PAYMENT_${method.toUpperCase().replace(/\s/g, '_')}`, 
                title: method 
            }
        }));
        
        const interactivePayload = {
            type: 'interactive',
            interactive: {
                type: 'button',
                body: { text: "*💳 Elige tu Método de Pago:*" },
                action: { buttons: buttons }
            }
        };

        await sendMessage(to, interactivePayload, auth); // 🛑 Usar auth dinámico
    } catch (error) {
        logger.error(`Error pagos SaaS:`, error);
    }
};