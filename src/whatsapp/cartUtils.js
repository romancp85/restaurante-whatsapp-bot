// src/whatsapp/cartUtils.js - VERSIÓN PROTEGIDA CONTRA CASTERROR

import ShoppingCart from '../models/ShoppingCart.js';
import MenuItem from '../models/MenuItem.js';
import logger from '../utils/logger.js';

/**
 * Obtiene o crea el carrito de compras para un número de teléfono.
 */
export const getOrCreateCart = async (userId) => {
  let cart = await ShoppingCart.findOne({ clientPhone: userId }); 

  if (!cart) {
    cart = new ShoppingCart({ clientPhone: userId });
    await cart.save();
    logger.info(`Nuevo carrito creado para ${userId}`); 
  }
  return cart;
};

/**
 * Actualiza el carrito con nuevos datos y guarda el estado de la conversación.
 */
export const updateCart = async (userId, updates) => {
  const cart = await getOrCreateCart(userId);
  updates.lastActivity = Date.now();

  if (updates.conversationState) cart.conversationState = updates.conversationState;
  if (updates.tempData) cart.tempData = { ...cart.tempData, ...updates.tempData };

  await cart.save();
  return cart;
};


/**
 * Añade un ítem al carrito o incrementa la cantidad si ya existe.
 * MODIFICACIÓN: Validación de ObjectId añadida para evitar CRASH del servidor.
 */
export const addItemToCart = async (userId, cart, itemId, quantity, notes = '') => {
  
  // 🛡️ ESCUDO DE SEGURIDAD (ANTI-CASTERROR)
  // Si el itemId no es una cadena de 24 caracteres hexadecimales, MongoDB lanzará un error.
  // Validamos aquí para manejarlo de forma elegante.
  const isValidObjectId = /^[0-9a-fA-F]{24}$/.test(itemId?.toString());
  
  if (!isValidObjectId) {
    logger.warn(`[Carrito] ID con formato inválido detectado: "${itemId}". Evitando consulta a DB.`);
    return { success: false, name: `ID:${itemId}`, reason: 'ID_INVALIDO' };
  }

  // Ahora es 100% seguro llamar a findById
  const itemData = await MenuItem.findById(itemId);

  if (!itemData) {
    logger.warn(`Intento de añadir ítem no encontrado: ${itemId}`);
    return { success: false, name: `ID:${itemId}`, reason: 'NO_ENCONTRADO' };
  }

  // VALIDACIÓN 1: Ítem no activo o no disponible hoy
  if (itemData.activo === false) {
    logger.warn(`Intento de añadir ítem inactivo: ${itemData.nombre}`);
    return { success: false, name: itemData.nombre, reason: 'INACTIVO' };
  }

  if (itemData.disponible === false) {
    logger.warn(`Intento de añadir ítem no disponible hoy: ${itemData.nombre}`);
    return { success: false, name: itemData.nombre, reason: 'NO_DISPONIBLE' };
  }

  const finalQuantity = parseInt(quantity) > 0 ? parseInt(quantity) : 1;
  const disponibleHoy = (itemData.cantidad_diaria || 0) - (itemData.vendidas_hoy || 0);

  // CORRECCIÓN DE ROBUSTEZ: Buscar si ya existe en el carrito
  const existingItemIndex = cart.items.findIndex(i =>
    (i.itemId?.toString() === itemData._id.toString()) && i.notes === notes
  );

  const cantidadEnCarrito = existingItemIndex > -1 ? cart.items[existingItemIndex].cantidad : 0;

  // VALIDACIÓN 2: Stock
  if (cantidadEnCarrito + finalQuantity > disponibleHoy) {
    logger.warn(`Intento de exceder stock de ${itemData.nombre}. Disponible: ${disponibleHoy}`);
    return { success: false, name: itemData.nombre, reason: 'SIN_STOCK', available: disponibleHoy };
  }

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
 * Elimina un ítem del carrito por su índice.
 */
export const removeItemFromCart = async (userId, cart, itemIndex) => {
  const indexToRemove = itemIndex - 1; 

  if (indexToRemove >= 0 && indexToRemove < cart.items.length) {
    const removedItem = cart.items.splice(indexToRemove, 1);
    logger.info(`Ítem eliminado del carrito: ${removedItem[0].nombre}`);

    cart.lastActivity = Date.now();
    await cart.save();
  }
  return cart;
};