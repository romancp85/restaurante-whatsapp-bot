// src/whatsapp/cartUtils.js
import ShoppingCart from '../models/ShoppingCart.js';
import MenuItem from '../models/MenuItem.js';
import logger from '../utils/logger.js';

/**
 * 1. Obtener o crear el carrito (Multi-tenant)
 */
export const getOrCreateCart = async (whatsappId, businessId) => {
  let cart = await ShoppingCart.findOne({ whatsappId, businessId }); 

  if (!cart) {
    cart = new ShoppingCart({ 
        whatsappId, 
        businessId,
        items: [],
        totalCents: 0,
        tempData: { history: [], menuMap: [] }
    });
    await cart.save();
  }
  return cart;
};

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

  // --- 🛒 LÓGICA DE STOCK INTEGRADA ---
  const cart = await getOrCreateCart(whatsappId, businessId);
  
  const stockDisponible = itemData.cantidad_diaria - itemData.vendidas_hoy;
  // Calculamos cuánto lleva ya de este producto en el carrito
  const cantidadEnCarrito = cart.items
      .filter(i => i.itemId.toString() === itemId.toString())
      .reduce((acc, curr) => acc + curr.cantidad, 0);

  if (cantidadEnCarrito + quantity > stockDisponible) {
      return { success: false, reason: 'SIN_STOCK', disponible: stockDisponible - cantidadEnCarrito, name: itemData.nombre };
  }
  // ------------------------------------

  // Cálculo de precio por unidad (Base + Modificadores)
  let precioFinalUnidad = itemData.precioBase;
  if (opcionesSeleccionadas && opcionesSeleccionadas.length > 0) {
      precioFinalUnidad += opcionesSeleccionadas.reduce((total, opt) => total + (opt.precioExtra || 0), 0);
  }

  // LÓGICA DE AGRUPACIÓN:
  // Se agrupa solo si: Mismo ID + Mismas opciones + Mismas NOTAS
  const itemIndex = cart.items.findIndex(i => 
    i.itemId.toString() === itemId.toString() && 
    JSON.stringify(i.opcionesSeleccionadas) === JSON.stringify(opcionesSeleccionadas) &&
    (i.notas || "").trim() === (notas || "").trim()
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
      notas: notas || ""
    });
  }

  // Recalcular total del carrito
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
  
  // Merge inteligente de tempData para no borrar lo que ya existe
  if (updates.tempData) {
      cart.tempData = { ...cart.tempData, ...updates.tempData };
  }
  
  if (updates.items) {
      cart.items = updates.items;
      cart.totalCents = cart.items.reduce((acc, item) => acc + (item.precioUnitario * item.cantidad), 0);
  }

  // Forzar a Mongoose a detectar cambios en el objeto mixto tempData
  if (updates.tempData) cart.markModified('tempData');

  await cart.save();
  return cart;
};

/**
 * 4. Eliminar ítem por Índice
 */
export const removeItemByIndex = async (whatsappId, businessId, index) => {
    const cart = await ShoppingCart.findOne({ whatsappId, businessId });
    if (!cart || !cart.items[index]) return { success: false, reason: 'ITEM_NOT_FOUND' };

    const removedName = cart.items[index].nombre;
    cart.items.splice(index, 1);

    if (cart.items.length === 0) {
        cart.totalCents = 0;
        cart.conversationState = 'INICIO';
    } else {
        cart.totalCents = cart.items.reduce((acc, item) => acc + (item.precioUnitario * item.cantidad), 0);
    }

    await cart.save();
    return { success: true, removedName, empty: cart.items.length === 0 };
};

/**
 * 🗑️ ELIMINACIÓN POR NOMBRE (Especial para Mateo IA)
 */
export const removeItemsByName = async (whatsappId, businessId, productName) => {
    const cart = await ShoppingCart.findOne({ whatsappId, businessId });
    if (!cart || cart.items.length === 0) return null;

    const nombreBusqueda = productName.toLowerCase();
    
    // Filtramos: se quedan los productos que NO coincidan con lo que la IA quiere quitar
    const itemsFiltrados = cart.items.filter(item => {
        const itemNombre = item.nombre.toLowerCase();
        // Comprobación de ida y vuelta para mayor precisión
        return !itemNombre.includes(nombreBusqueda) && !nombreBusqueda.includes(itemNombre);
    });

    if (itemsFiltrados.length === cart.items.length) {
        return cart; // No se borró nada, devolvemos el carrito igual
    }

    cart.items = itemsFiltrados;

    // Si se vació, reseteamos a INICIO
    if (cart.items.length === 0) {
        cart.totalCents = 0;
        cart.conversationState = 'INICIO';
    } else {
        // Recalculamos financiero
        cart.totalCents = cart.items.reduce((acc, item) => acc + (item.precioUnitario * item.cantidad), 0);
    }

    await cart.save();
    return cart;
};