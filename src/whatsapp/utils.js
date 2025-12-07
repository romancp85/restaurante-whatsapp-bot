// src/whatsapp/utils.js - VERSIÓN COMPLETA CON LECTURA DE CONFIGURACIÓN DINÁMICA

import axios from 'axios';
import MenuItem from '../models/MenuItem.js';
import logger from '../utils/logger.js';
import dotenv from 'dotenv';
import { updateCart } from './cartUtils.js'; 
import { getAcceptedPaymentMethods } from '../services/paymentService.js'; // ⬅️ NUEVO SERVICIO

dotenv.config();

// 🛑 USAMOS TUS NOMBRES DE VARIABLES DE ENTORNO 🛑
const WABA_TOKEN = process.env.WHATSAPP_TOKEN;      
const WABA_ID = process.env.WHATSAPP_PHONE_ID;      

const API_URL = `https://graph.facebook.com/v19.0/${WABA_ID}/messages`;

/**
 * Utilidad simple para formatear precios.
 * @param {number} priceInCents - Precio en centavos.
 * @returns {string} Precio formateado (ej: "$55.00").
 */
const formatPrice = (priceInCents) => {
    return `$${(priceInCents / 100).toFixed(2)}`;
};

/**
 * Función genérica para enviar cualquier tipo de mensaje de texto a WhatsApp.
 * @param {string} to - Número de teléfono del destinatario.
 * @param {string} text - Contenido del mensaje.
 */
export const sendMessage = async (to, text) => {
    try {
        await axios.post(API_URL, {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: to,
            type: 'text',
            text: {
                preview_url: false, 
                body: text
            }
        }, {
            headers: {
                'Authorization': `Bearer ${WABA_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        logger.info(`Mensaje enviado a ${to}: "${text.substring(0, 50)}..."`);
    } catch (error) {
        logger.error(`Error al enviar mensaje a ${to}:`, error.response?.data || error.message);
    }
};

/**
 * Formatea y envía el menú completo al cliente usando texto plano.
 * Además, guarda el mapeo de índice-ID en el carrito para procesar la selección.
 * @param {string} to - Número de teléfono del destinatario.
 */
export const sendMenu = async (to) => {
    try {
        // Aseguramos que solo mostramos ítems que tienen stock
        const menuItems = await MenuItem.find({ cantidad_diaria: { $gt: 0 } }).sort({ categoria: 1, nombre: 1 });

        let menuText = "*¡Bienvenido al Menú!* 🍔\n\n";
        let currentCategory = "";

        // 1. Construir el texto del menú
        const menuMap = menuItems.map((item, index) => {
            const itemNumber = index + 1;
            
            // Añadir encabezado de categoría si cambia
            if (item.categoria !== currentCategory) {
                currentCategory = item.categoria;
                menuText += `\n*-- ${currentCategory.toUpperCase()} --*\n`;
            }
            // Formato: [1] Hamburguesa Clásica - $55.00
            menuText += `[${itemNumber}] ${item.nombre} - ${formatPrice(item.precio)}\n`;

            // Mapeo para guardar temporalmente
            return { 
                index: itemNumber, 
                itemId: item._id, 
                nombre: item.nombre
            };
        });
        
        menuText += "\n👉 *Responde con el número* del producto que deseas pedir (ej: *5*).";
        menuText += "\n\nO utiliza estos comandos:\n👉 *CARRITO*: Ver tus productos.\n👉 *FINALIZAR*: Ir a checkout.";

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
    
    // Aquí deberías integrar la lectura dinámica del COSTO_ENVIO, pero por ahora usamos un default:
    const COSTO_ENVIO = 3000; 

    cart.items.forEach((item, index) => {
        const totalItemPrice = item.precioUnitario * item.cantidad;
        subtotal += totalItemPrice;
        
        // Formato: 1. (x2) Hamburguesa de Pollo - $110.00
        summaryText += `${index + 1}. (x${item.cantidad}) ${item.nombre} - ${formatPrice(totalItemPrice)}\n`;
        if (item.notas) {
            summaryText += `   _${item.notas}_\n`;
        }
    });
    
    const total = subtotal + COSTO_ENVIO;

    summaryText += "\n*--- Resumen ---\n*";
    summaryText += `Subtotal: ${formatPrice(subtotal)}\n`;
    summaryText += `Costo de Envío: ${formatPrice(COSTO_ENVIO)}\n`;
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
        // 🛑 LECTURA DINÁMICA: Usamos el servicio de pago para obtener los métodos 🛑
        const acceptedMethods = await getAcceptedPaymentMethods();
        
        if (acceptedMethods.length === 0) {
            await sendMessage(to, "Lo sentimos, no pudimos cargar los métodos de pago. Por favor, escribe *CONFIRMAR* si deseas pagar en Efectivo.");
            return;
        }

        const buttons = acceptedMethods.map(method => ({
            type: "reply",
            reply: {
                // El ID que se enviará al webhook será: PAYMENT_EFECTIVO
                id: `PAYMENT_${method.toUpperCase().replace(/\s/g, '_')}`, 
                title: method // El texto visible en el botón (Efectivo)
            }
        }));

        await axios.post(API_URL, {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: to,
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
        }, {
            headers: {
                'Authorization': `Bearer ${WABA_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        
        logger.info(`Opciones de pago enviadas a ${to}.`);

    } catch (error) {
        logger.error(`Error al enviar opciones de pago a ${to}:`, error.response?.data || error.message);
        await sendMessage(to, "Hubo un error al cargar las opciones de pago. Por favor, contacta al restaurante.");
    }
};