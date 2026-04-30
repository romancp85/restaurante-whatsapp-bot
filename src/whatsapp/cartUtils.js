// src/whatsapp/cartUtils.js - VERSIÓN PROTEGIDA CONTRA CASTERROR

import ShoppingCart from '../models/ShoppingCart.js';
import MenuItem from '../models/MenuItem.js';
import logger from '../utils/logger.js';

/**
 * 1. Obtener o crear el carrito con aislamiento de restaurante (Multi-tenant)
 */
export const getOrCreateCart = async (userId, businessId) => {
  // Buscamos el carrito que coincida con el usuario Y el restaurante
  let cart = await ShoppingCart.findOne({ clientPhone: userId, businessId: businessId }); 

  if (!cart) {
    cart = new ShoppingCart({ 
        clientPhone: userId, 
        businessId: businessId,
        items: [] 
    });
    await cart.save();
    logger.info(`[SaaS] Nuevo carrito creado para ${userId} en Restaurante ${businessId}`); 
  }
  return cart;
};


/**
 * 2. Añadir ítem complejo con modificadores y validación de reglas
 */
// src/whatsapp/cartUtils.js

export const addItemToCart = async (userId, businessId, itemDetails) => {
  // CORRECCIÓN 1: Extraemos 'notas' (español) para coincidir con el Validador
  const { itemId, quantity, opcionesSeleccionadas, notas } = itemDetails;

  const itemData = await MenuItem.findOne({ _id: itemId, businessId: businessId });

  if (!itemData || !itemData.activo) {
    logger.warn(`[Seguridad] Intento de añadir producto inválido: ${itemId}`);
    return { success: false, reason: 'PRODUCTO_NO_DISPONIBLE' };
  }

  let precioFinalUnidad = itemData.precioBase;
  if (opcionesSeleccionadas && opcionesSeleccionadas.length > 0) {
      precioFinalUnidad += opcionesSeleccionadas.reduce((total, opt) => total + (opt.precioExtra || 0), 0);
  }

  const disponibleHoy = itemData.cantidad_diaria - itemData.vendidas_hoy;
  if (quantity > disponibleHoy) {
    return { success: false, reason: 'SIN_STOCK', available: disponibleHoy };
  }

  const cart = await getOrCreateCart(userId, businessId);

  /**
   * CORRECCIÓN 2: Lógica de Agrupación
   * Un producto es "el mismo" solo si tiene el mismo ID, mismas opciones Y MISMAS NOTAS.
   * Si no comparamos las notas, la pizza "con picante" se fusionaría con la "sin picante".
   */
  const itemIndex = cart.items.findIndex(i => 
    i.itemId.toString() === itemId.toString() && 
    JSON.stringify(i.opcionesSeleccionadas) === JSON.stringify(opcionesSeleccionadas) &&
    (i.notas || "") === (notas || "") // <--- IMPORTANTE: Comparar notas
  );

  if (itemIndex > -1) {
    cart.items[itemIndex].cantidad += quantity;
  } else {
    cart.items.push({
      itemId,
      nombre: itemData.nombre,
      precioUnitario: precioFinalUnidad,
      cantidad: quantity,
      opcionesSeleccionadas,
      notas: notas || "" // <--- Guardamos como 'notas'
    });
  }

  await cart.save();
  return { success: true, name: itemData.nombre, totalPrice: precioFinalUnidad * quantity };
};


/**
 * 3. Actualizar estado de la conversación (Multi-tenant)
 */
// src/whatsapp/cartUtils.js

export const updateCart = async (userId, businessId, updates) => {
  const cart = await getOrCreateCart(userId, businessId);
  
  if (updates.conversationState) cart.conversationState = updates.conversationState;
  if (updates.tempData) cart.tempData = { ...cart.tempData, ...updates.tempData };
  
  // 🌟 CORRECCIÓN CRÍTICA: Permitir que el array de items se actualice
  if (updates.items) {
      cart.items = updates.items;
  }

  await cart.save();
  return cart;
};

/**
 * 4. Eliminar un ítem del carrito por su índice (Protegido por Multi-tenant)
 */
export const removeItemFromCart = async (userId, businessId, itemIndex) => {
  try {
      // Obtenemos el carrito específico de este usuario en este restaurante
      const cart = await getOrCreateCart(userId, businessId);
      
      // El comando del usuario suele ser "QUITAR 1", pero los arrays inician en 0
      const indexToRemove = itemIndex - 1; 

      if (indexToRemove >= 0 && indexToRemove < cart.items.length) {
        const removedItem = cart.items.splice(indexToRemove, 1);
        logger.info(`[SaaS] Ítem "${removedItem[0].nombre}" eliminado del carrito de ${userId}`);

        // Actualizamos la actividad y guardamos
        cart.lastActivity = Date.now();
        await cart.save();
        
        return { success: true, removedName: removedItem[0].nombre };
      } else {
        return { success: false, reason: 'INDICE_INVALIDO' };
      }
  } catch (error) {
      logger.error(`Error al eliminar ítem del carrito: ${error.message}`);
      return { success: false, reason: 'ERROR_INTERNO' };
  }
};