// src/whatsapp/utils.js

import axios from 'axios';
import MenuItem from '../models/MenuItem.js'; // Necesario para obtener la información del menú
import logger from '../utils/logger.js';
import dotenv from 'dotenv';

dotenv.config();

// 🛑 Obtener credenciales del .env 🛑
const WABA_TOKEN = process.env.WABA_TOKEN; // Tu token de acceso de Meta
const WABA_ID = process.env.WABA_ID;     // Tu número de teléfono o ID de WhatsApp Business

const API_URL = `https://graph.facebook.com/v19.0/${WABA_ID}/messages`;

/**
 * Función genérica para enviar cualquier tipo de mensaje de texto a WhatsApp.
 * @param {string} to - Número de teléfono del destinatario (ej: 5218112345678).
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
                // Es obligatorio usar formato de previsualización de enlace, pero lo dejamos en false si no hay links
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
 * @param {string} to - Número de teléfono del destinatario.
 */
export const sendMenu = async (to) => {
    try {
        const menuItems = await MenuItem.find({}).sort({ categoria: 1, nombre: 1 });

        let menuText = "*¡Bienvenido al Menú!* 🍔\n\n";
        let currentCategory = "";

        menuItems.forEach((item, index) => {
            if (item.categoria !== currentCategory) {
                currentCategory = item.categoria;
                menuText += `\n*-- ${currentCategory.toUpperCase()} --*\n`;
            }
            // Formato: [10] Hamburguesa Clásica - $55.00
            menuText += `[${index + 1}] ${item.nombre} - ${formatPrice(item.precio)}\n`;
        });
        
        menuText += "\n👉 *Responde con el número* del producto que deseas pedir (ej: *10*).";
        menuText += "\n\nO utiliza estos comandos:\n👉 *CARRITO*: Ver tus productos.\n👉 *EMPEZAR*: Volver a la lista de categorías.";

        await sendMessage(to, menuText);
        
        // Devolvemos los ítems y sus índices para que el webhook pueda mapear la selección
        return menuItems.map((item, index) => ({ 
            index: index + 1, 
            itemId: item._id, 
            nombre: item.nombre,
            precio: item.precio // En centavos
        }));

    } catch (error) {
        logger.error('Error al generar y enviar el menú:', error);
        await sendMessage(to, "Lo sentimos, no pudimos cargar el menú. Por favor, intenta más tarde.");
        return [];
    }
};

/**
 * Formatea y envía el resumen del carrito de compras.
 * @param {string} to - Número de teléfono del destinatario.
 * @param {object} cart - El objeto del carrito de ShoppingCart.
 */
export const sendCartSummary = async (to, cart) => {
    if (cart.items.length === 0) {
        await sendMessage(to, "🛒 Tu carrito está vacío.\nResponde *MENU* para ver nuestros productos.");
        return;
    }

    let summaryText = "*🛒 Tu Carrito Actual:*\n\n";
    let subtotal = 0;

    cart.items.forEach((item, index) => {
        const totalItemPrice = item.precioUnitario * item.cantidad;
        subtotal += totalItemPrice;
        
        // Formato: 1. (x2) Hamburguesa de Pollo - $110.00
        summaryText += `${index + 1}. (x${item.cantidad}) ${item.nombre} - ${formatPrice(totalItemPrice)}\n`;
        if (item.notas) {
            summaryText += `   _${item.notas}_\n`;
        }
    });
    
    // Asumiendo costo de envío fijo (ajusta si tienes un modelo de Configuración)
    const costoEnvio = 3000; // $30.00 en centavos
    const total = subtotal + costoEnvio;

    summaryText += "\n*--- Resumen ---\n*";
    summaryText += `Subtotal: ${formatPrice(subtotal)}\n`;
    summaryText += `Costo de Envío: ${formatPrice(costoEnvio)}\n`;
    summaryText += `*Total a Pagar: ${formatPrice(total)}*\n`;
    
    summaryText += "\n\n*Opciones:*\n👉 *CONFIRMAR*: Para finalizar tu pedido (se te pedirá tu dirección).\n👉 *MENU*: Agregar más productos.\n👉 *QUITAR [X]*: Eliminar el ítem por su número (ej: *QUITAR 1*).";

    await sendMessage(to, summaryText);
};


/**
 * Utilidad simple para formatear precios.
 * @param {number} priceInCents - Precio en centavos.
 * @returns {string} Precio formateado (ej: "$55.00").
 */
const formatPrice = (priceInCents) => {
    return `$${(priceInCents / 100).toFixed(2)}`;
};