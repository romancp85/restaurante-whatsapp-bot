// src/whatsapp/cartUtils.js - VERSIÓN UNIFICADA (Nivel Square)

import ShoppingCart from '../models/ShoppingCart.js';
import MenuItem from '../models/MenuItem.js';
import logger from '../utils/logger.js';

/**
 * 1. Obtener o crear el carrito (Multi-tenant)
 * Estandarizamos a 'whatsappId' para ser coherentes con el Webhook y Meta
 */
export const getOrCreateCart = async (whatsappId, businessId) => {
  // Buscamos por whatsappId y businessId para el aislamiento multi-tenant
  let cart = await ShoppingCart.findOne({ whatsappId, businessId }); 

  if (!cart) {
    cart = new ShoppingCart({ 
        whatsappId, 
        businessId,
        items: [],
        totalCents: 0, // Inicializamos para evitar NaNs en cálculos
        tempData: { history: [], menuMap: [] }
    });
    await cart.save();
    logger.info(`[SaaS] Carrito creado: ${whatsappId} en Negocio ${businessId}`); 
  }
  return cart;
};

// Antes de añadir, verificar disponibilidad real
const stockDisponible = itemData.cantidad_diaria - itemData.vendidas_hoy;
const cantidadEnCarrito = cart.items
    .filter(i => i.itemId.toString() === itemId)
    .reduce((acc, curr) => acc + curr.cantidad, 0);

if (cantidadEnCarrito + quantity > stockDisponible) {
    return { success: false, reason: 'SIN_STOCK', disponible: stockDisponible };
}

/**
 * 2. Añadir ítem con validación de Stock y Modificadores
 */
export const addItemToCart = async (whatsappId, businessId, itemDetails) => {
  const { itemId, quantity, opcionesSeleccionadas, notas } = itemDetails;

  // Validación de seguridad: el producto debe pertenecer al negocio
  const itemData = await MenuItem.findOne({ _id: itemId, businessId });

  if (!itemData || !itemData.activo) {
    logger.warn(`[Seguridad] Producto inválido o inactivo: ${itemId}`);
    return { success: false, reason: 'PRODUCTO_NO_DISPONIBLE' };
  }

  // Cálculo de precio por unidad (Base + Modificadores)
  let precioFinalUnidad = itemData.precioBase;
  if (opcionesSeleccionadas && opcionesSeleccionadas.length > 0) {
      precioFinalUnidad += opcionesSeleccionadas.reduce((total, opt) => total + (opt.precioExtra || 0), 0);
  }

  const cart = await getOrCreateCart(whatsappId, businessId);

  // LÓGICA DE AGRUPACIÓN ENTERPRISE:
  // Se agrupa solo si: Mismo ID + Mismas opciones + Mismas NOTAS
  const itemIndex = cart.items.findIndex(i => 
    i.itemId.toString() === itemId.toString() && 
    JSON.stringify(i.opcionesSeleccionadas) === JSON.stringify(opcionesSeleccionadas) &&
    (i.notas || "").trim() === (notas || "").trim()
  );

  if (itemIndex > -1) {
    cart.items[itemIndex].cantidad += quantity;
    // Recalculamos subtotal del item si fuera necesario
  } else {
    cart.items.push({
      itemId,
      nombre: itemData.nombre,
      precioUnitario: precioFinalUnidad,
      cantidad: quantity,
      opcionesSeleccionadas,
      notas: notas || ""
    });
  }

  // REGLA DE ORO: Recalcular totalCents del carrito antes de guardar
  cart.totalCents = cart.items.reduce((acc, item) => acc + (item.precioUnitario * item.cantidad), 0);

  await cart.save();
  return { success: true, name: itemData.nombre, totalPrice: precioFinalUnidad * quantity };
};

/**
 * 3. Actualizar estado y metadatos
 */
export const updateCart = async (whatsappId, businessId, updates) => {
  const cart = await getOrCreateCart(whatsappId, businessId);
  
  if (updates.conversationState) cart.conversationState = updates.conversationState;
  if (updates.tempData) cart.tempData = { ...cart.tempData, ...updates.tempData };
  
  if (updates.items) {
      cart.items = updates.items;
      // Si actualizamos items manualmente, recalculamos el total
      cart.totalCents = cart.items.reduce((acc, item) => acc + (item.precioUnitario * item.cantidad), 0);
  }

  await cart.save();
  return cart;
};

/**
 * 4. Eliminar ítem por Índice (Única función para Botones y Comandos)
 * @param {number} index - Índice 0-based
 */
export const removeItemByIndex = async (whatsappId, businessId, index) => {
    const cart = await ShoppingCart.findOne({ whatsappId, businessId });
    if (!cart || !cart.items[index]) return { success: false, reason: 'ITEM_NOT_FOUND' };

    const removedName = cart.items[index].nombre;
    
    // Eliminamos del array
    cart.items.splice(index, 1);

    // Si el carrito queda vacío, lo reseteamos o eliminamos
    if (cart.items.length === 0) {
        cart.totalCents = 0;
        cart.conversationState = 'INICIO';
        cart.tempData.lastProductDiscussed = null;
    } else {
        // Recalculamos el total (Regla de Oro de Finanzas)
        cart.totalCents = cart.items.reduce((acc, item) => acc + (item.precioUnitario * item.cantidad), 0);
    }

    await cart.save();
    return { success: true, removedName, empty: cart.items.length === 0 };
};