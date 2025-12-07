// src/whatsapp/cartUtils.js

import ShoppingCart from '../models/ShoppingCart.js';
import MenuItem from '../models/MenuItem.js';
import logger from '../utils/logger.js';

// Estado inicial de la conversación
const INITIAL_STATE = 'INICIO';

/**
 * Obtiene el carrito de compras del cliente o crea uno nuevo si no existe.
 * @param {string} phone - Número de teléfono del cliente.
 * @returns {object} El objeto ShoppingCart.
 */
export const getOrCreateCart = async (phone) => {
    try {
        let cart = await ShoppingCart.findOne({ clientPhone: phone });
        
        if (!cart) {
            cart = await ShoppingCart.create({
                clientPhone: phone,
                conversationState: INITIAL_STATE,
                items: [],
                tempData: {}
            });
            logger.info(`Nuevo carrito creado para: ${phone}`);
        } else {
            // Actualizar solo la actividad
            cart.lastActivity = Date.now();
            await cart.save();
        }
        return cart;
    } catch (error) {
        logger.error(`Error en getOrCreateCart para ${phone}:`, error);
        return { clientPhone: phone, conversationState: 'ERROR', items: [], tempData: {} };
    }
};

/**
 * Actualiza el estado y los datos temporales del carrito.
 * @param {string} phone - Número de teléfono del cliente.
 * @param {object} updates - Objeto con los campos a actualizar (ej: { conversationState: 'NUEVO_ESTADO', items: [...] }).
 */
export const updateCart = async (phone, updates) => {
    try {
        const result = await ShoppingCart.findOneAndUpdate(
            { clientPhone: phone },
            { $set: { ...updates, lastActivity: Date.now() } },
            { new: true, upsert: false }
        );
        return result;
    } catch (error) {
        logger.error(`Error en updateCart para ${phone}:`, error);
    }
};

/**
 * Agrega un ítem al carrito de forma simple (usado en lógica de IA o selección final).
 * @param {object} cart - El objeto de carrito actual.
 * @param {string} itemId - ID de Mongoose del MenuItem.
 * @param {number} quantity - Cantidad a agregar.
 * @param {string} [notes=''] - Notas opcionales.
 */
export const addItemToCart = async (cart, itemId, quantity, notes = '') => {
    const itemData = await MenuItem.findById(itemId);

    if (!itemData) {
        logger.warn(`Intento de añadir ítem no encontrado: ${itemId}`);
        return null;
    }

    const newItem = {
        itemId: itemData._id,
        nombre: itemData.nombre,
        precioUnitario: itemData.precio,
        cantidad: quantity,
        notas: notes,
    };

    // Buscamos si el ítem ya existe en el carrito
    const existingItemIndex = cart.items.findIndex(i => 
        i.itemId.equals(itemData._id) && i.notas === notes
    );

    if (existingItemIndex > -1) {
        // Si existe y tiene las mismas notas, solo aumentamos la cantidad
        cart.items[existingItemIndex].cantidad += quantity;
    } else {
        // Si es nuevo, lo agregamos
        cart.items.push(newItem);
    }
    
    // Actualizamos la actividad y guardamos
    cart.lastActivity = Date.now();
    await cart.save();
    return cart;
};