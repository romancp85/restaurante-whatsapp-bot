// src/whatsapp/cartUtils.js - LÓGICA DE VALIDACIÓN Y ESTRUCTURA DE RETORNO ESTABLE

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
    updates.lastActivity = Date.now();
    
    if (updates.conversationState) {
        cart.conversationState = updates.conversationState;
    }

    if (updates.tempData) {
        cart.tempData = { ...cart.tempData, ...updates.tempData };
    }
    
    await cart.save();
    return cart;
};


/**
 * Añade un ítem al carrito o incrementa la cantidad si ya existe.
 * @param {object} cart - El objeto ShoppingCart actual.
 * @param {string} itemId - ID del producto.
 * @param {number} quantity - Cantidad a añadir.
 * @param {string} notes - Notas o especificaciones para el ítem.
 * @returns {Promise<object>} Objeto de resultado estructurado (success: boolean, name: string, reason?: string).
 */
export const addItemToCart = async (cart, itemId, quantity, notes = '') => {
    const itemData = await MenuItem.findById(itemId);

    if (!itemData) {
        logger.warn(`Intento de añadir ítem no encontrado: ${itemId}`);
        return { success: false, name: `ID:${itemId}`, reason: 'NO_ENCONTRADO' };
    }
    
    // VALIDACIÓN 1: Ítem no activo o no disponible hoy
    if (itemData.activo === false) {
        logger.warn(`Intento de añadir ítem inactivo (fuera de menú): ${itemData.nombre}`);
        return { success: false, name: itemData.nombre, reason: 'INACTIVO' };
    }
    
    if (itemData.disponible === false) {
        logger.warn(`Intento de añadir ítem no disponible hoy: ${itemData.nombre}`);
        return { success: false, name: itemData.nombre, reason: 'NO_DISPONIBLE' }; 
    }
    // ----------------------------------------------------------------------

    const finalQuantity = parseInt(quantity) > 0 ? parseInt(quantity) : 1;
    const disponibleHoy = itemData.cantidad_diaria - itemData.vendidas_hoy;
    
    // 🛑 CORRECCIÓN CRÍTICA (Línea 96): Usar toString() para robustez 🛑
    const existingItemIndex = cart.items.findIndex(i => 
        (i.itemId?.toString() === itemData._id.toString()) && i.notas === notes
    );
    // ----------------------------------------------------------------------
    
    const cantidadEnCarrito = existingItemIndex > -1 ? cart.items[existingItemIndex].cantidad : 0;
    
    // VALIDACIÓN 2: Stock
    if (cantidadEnCarrito + finalQuantity > disponibleHoy) {
        logger.warn(`Intento de exceder stock de ${itemData.nombre}. Disponible: ${disponibleHoy}`);
        return { success: false, name: itemData.nombre, reason: 'SIN_STOCK', available: disponibleHoy };
    }
    // ----------------------------------------------------------------------


    const newItem = {
        itemId: itemData._id,
        nombre: itemData.nombre,
        precioUnitario: itemData.precio,
        cantidad: finalQuantity, 
        notas: notes,
    };

    if (existingItemIndex > -1) {
        cart.items[existingItemIndex].cantidad += finalQuantity;
    } else {
        cart.items.push(newItem);
    }
    
    cart.lastActivity = Date.now();
    await cart.save();
    return { success: true, name: itemData.nombre, quantity: finalQuantity };
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