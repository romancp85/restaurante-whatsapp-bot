// src/whatsapp/cartUtils.js

import ShoppingCart from '../models/ShoppingCart.js';
import MenuItem from '../models/MenuItem.js';
import logger from '../utils/logger.js';

/**
 * Obtiene o crea el carrito de compras para un número de teléfono.
 * @param {string} clientPhone - Número de teléfono del cliente.
 * @returns {Promise<ShoppingCart>} El carrito de compras.
 */
export const getOrCreateCart = async (clientPhone) => {
    let cart = await ShoppingCart.findOne({ clientPhone });

    if (!cart) {
        cart = new ShoppingCart({ clientPhone });
        await cart.save();
        logger.info(`Nuevo carrito creado para ${clientPhone}`);
    }
    return cart;
};

/**
 * Actualiza el carrito con nuevos datos y guarda el estado de la conversación.
 * @param {string} clientPhone - Número de teléfono del cliente.
 * @param {object} updates - Objeto con los campos a actualizar.
 * @returns {Promise<ShoppingCart>} El carrito actualizado.
 */
export const updateCart = async (clientPhone, updates) => {
    const cart = await getOrCreateCart(clientPhone);
    // Aplicar la última actividad antes de cualquier actualización
    updates.lastActivity = Date.now();
    
    // Si se proporciona conversationState, actualizarlo
    if (updates.conversationState) {
        cart.conversationState = updates.conversationState;
    }

    // Si se proporciona tempData, fusionarlo
    if (updates.tempData) {
        // Asegurarse de que tempData sea un objeto antes de fusionar
        cart.tempData = { ...cart.tempData, ...updates.tempData };
    }
    
    // Para otros campos como items, se deben manejar directamente en el objeto cart antes de llamar a save.
    
    await cart.save();
    return cart;
};


/**
 * Añade un ítem al carrito o incrementa la cantidad si ya existe.
 * @param {object} cart - El objeto ShoppingCart actual.
 * @param {string} itemId - ID del producto.
 * @param {number} quantity - Cantidad a añadir.
 * @param {string} notes - Notas o especificaciones para el ítem.
 * @returns {Promise<ShoppingCart|null>} El carrito actualizado o null si el ítem no existe.
 */
export const addItemToCart = async (cart, itemId, quantity, notes = '') => {
    const itemData = await MenuItem.findById(itemId);

    if (!itemData) {
        logger.warn(`Intento de añadir ítem no encontrado: ${itemId}`);
        return null;
    }
    
    // 🛑 CORRECCIÓN: Si quantity no es un número válido, se establece a 1 (para la IA) 🛑
    const finalQuantity = parseInt(quantity) > 0 ? parseInt(quantity) : 1; 

    const newItem = {
        itemId: itemData._id,
        nombre: itemData.nombre,
        precioUnitario: itemData.precio,
        cantidad: finalQuantity, 
        notas: notes,
    };

    // Buscamos si el ítem ya existe en el carrito
    const existingItemIndex = cart.items.findIndex(i => 
        i.itemId.equals(itemData._id) && i.notas === notes
    );

    if (existingItemIndex > -1) {
        // Si existe, aumentamos la cantidad
        cart.items[existingItemIndex].cantidad += finalQuantity;
    } else {
        // Si es nuevo, lo agregamos
        cart.items.push(newItem);
    }
    
    cart.lastActivity = Date.now();
    await cart.save();
    return cart;
};


/**
 * Elimina un ítem del carrito por su índice (basado en el índice 1 del usuario).
 * @param {object} cart - El objeto ShoppingCart actual.
 * @param {number} itemIndex - El índice basado en 1 (del 1 al N) a eliminar.
 * @returns {Promise<ShoppingCart>} El carrito actualizado.
 */
export const removeItemFromCart = async (cart, itemIndex) => {
    const indexToRemove = itemIndex - 1; // Convertir índice de usuario a índice de array (base 0)

    if (indexToRemove >= 0 && indexToRemove < cart.items.length) {
        const removedItem = cart.items.splice(indexToRemove, 1);
        logger.info(`Ítem eliminado del carrito: ${removedItem[0].nombre}`);
        
        cart.lastActivity = Date.now();
        await cart.save();
    }
    return cart;
};