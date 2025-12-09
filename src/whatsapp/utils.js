// src/whatsapp/utils.js - VERSIÓN FINAL ESTABLE Y UNIVERSAL

import axios from 'axios';
import MenuItem from '../models/MenuItem.js';
import logger from '../utils/logger.js';
import dotenv from 'dotenv';
import { updateCart } from './cartUtils.js'; 
import { getAcceptedPaymentMethods } from '../services/paymentService.js'; 
import { getGlobalConfig } from '../services/configServiceDB.js'; 

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
const formatPrice = (priceInCents) => {
    return `$${(priceInCents / 100).toFixed(2)}`;
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
export const sendMessage = async (to, content) => {
    // 🛑 CORRECCIÓN UNIVERSAL: Detectar si es texto plano o un objeto de contenido 🛑
    const payload = typeof content === 'string'
        ? { type: 'text', text: { body: content } } 
        : content;

    try {
        await axios.post(API_URL, {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: to,
            ...payload // Spread del contenido (sea objeto o texto ya envuelto)
        }, {
            headers: {
                'Authorization': `Bearer ${WABA_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        
        // Loggear el cuerpo del texto de forma segura
        const logText = payload.text?.body || payload.interactive?.body?.text || JSON.stringify(payload);
        logger.info(`Mensaje enviado a ${to}: "${logText.substring(0, 50)}..."`);
        
    } catch (error) {
        // Log de depuración robusto
        const errorDetail = error.response?.data || error.message;
        logger.error(`Error al enviar mensaje a ${to}:`, errorDetail);
    }
};

/**
 * Formatea y envía el menú completo al cliente usando texto plano.
 * @param {string} to - Número de teléfono del destinatario.
 */
export const sendMenu = async (to) => {
    try {
        // Filtramos por disponible, stock y activo
        const menuItems = await MenuItem.find({ 
            disponible: true, 
            cantidad_diaria: { $gt: 0 }, 
            activo: true
        }).sort({ categoria: 1, nombre: 1 });

        let menuText = "*¡Bienvenido al Menú!* 🍔\n\n";
        let currentCategory = "";

        // 1. Construir el texto del menú
        const menuMap = menuItems.map((item, index) => {
            const itemNumber = index + 1;
            
            if (item.categoria !== currentCategory) {
                currentCategory = item.categoria;
                menuText += `\n*-- ${currentCategory.toUpperCase()} --*\n`;
            }
            menuText += `[${itemNumber}] ${item.nombre} - ${formatPrice(item.precio)}\n`;

            return { 
                index: itemNumber, 
                itemId: item._id, 
                nombre: item.nombre
            };
        });
        
        menuText += "\n👉 *Responde con el número* del producto que deseas pedir (ej: *5*).";
        menuText += "\n\nO utiliza estos comandos:\n👉 *CARRITO*: Ver tus productos.\n👉 *FINALIZAR*: Ir a checkout.";

        // Usamos la versión de cadena de texto de sendMessage
        await sendMessage(to, menuText); 
        
        // 2. GUARDAR EL MAPEO Y ACTUALIZAR EL ESTADO 
        await updateCart(to, { 
            tempData: { menuMap: menuMap }, 
            conversationState: 'MOSTRANDO_MENU' 
        });

    } catch (error) {
        logger.error('Error al generar y enviar el menú:', error);
        await sendMessage(to, "Lo sentimos, no pudimos cargar el menú. Por favor, intenta más tarde.");
    }
};

/**
 * Formatea y envía el resumen del carrito de compras.
 * @param {string} to - Número de teléfono del destinatario.
 * @param {object} cart - El objeto del carrito de ShoppingCart.
 */
export const sendCartSummary = async (to, cart) => {
    if (cart.items.length === 0) {
        await sendMessage(to, "🛒 Tu carrito está vacío.\nResponde *MENÚ* para ver nuestros productos.");
        return;
    }

    let summaryText = "*🛒 Tu Carrito Actual:*\n\n";
    let subtotal = 0;
    
    const costoEnvio = await getDeliveryCost(); 

    cart.items.forEach((item, index) => {
        const totalItemPrice = item.precioUnitario * item.cantidad;
        subtotal += totalItemPrice;
        
        summaryText += `${index + 1}. (x${item.cantidad}) ${item.nombre} - ${formatPrice(totalItemPrice)}\n`;
        if (item.notas) {
            summaryText += `   _${item.notas}_\n`;
        }
    });
    
    const total = subtotal + costoEnvio;

    summaryText += "\n*--- Resumen ---\n*";
    summaryText += `Subtotal: ${formatPrice(subtotal)}\n`;
    summaryText += `Costo de Envío: ${formatPrice(costoEnvio)}\n`; 
    summaryText += `*Total a Pagar: ${formatPrice(total)}*\n`;
    
    summaryText += "\n\n*Opciones:*\n👉 *FINALIZAR*: Ir a checkout.\n👉 *MENÚ*: Agregar más productos.\n👉 *QUITAR [X]*: Eliminar el ítem por su número (ej: *QUITAR 1*).";

    await sendMessage(to, summaryText);
};


/**
 * Envía un mensaje interactivo con botones para elegir el método de pago.
 * @param {string} to - Número de teléfono del destinatario.
 */
export const sendPaymentMethodOptions = async (to) => {
    try {
        const acceptedMethods = await getAcceptedPaymentMethods();
        
        if (acceptedMethods.length === 0) {
            await sendMessage(to, "Lo sentimos, no pudimos cargar los métodos de pago. Por favor, escribe *CONFIRMAR* si deseas pagar en Efectivo.");
            return;
        }

        const buttons = acceptedMethods.map(method => ({
            type: "reply",
            reply: {
                id: `PAYMENT_${method.toUpperCase().replace(/\s/g, '_')}`, 
                title: method 
            }
        }));
        
        // Construcción manual del payload interactivo
        const interactivePayload = {
            type: 'interactive',
            interactive: {
                type: 'button',
                body: {
                    text: "*💳 Elige tu Método de Pago:* \n\nSelecciona una de las opciones para continuar con el resumen final."
                },
                action: {
                    buttons: buttons
                }
            }
        };

        // Enviamos el objeto estructurado
        await sendMessage(to, interactivePayload);
        
        logger.info(`Opciones de pago enviadas a ${to}.`);

    } catch (error) {
        logger.error(`Error al enviar opciones de pago a ${to}:`, error.response?.data || error.message);
        await sendMessage(to, "Hubo un error al cargar las opciones de pago. Por favor, contacta al restaurante.");
    }
};