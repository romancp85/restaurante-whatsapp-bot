// src/whatsapp/cartUtils.js
import ShoppingCart from "../models/ShoppingCart.js";
import MenuItem from "../models/MenuItem.js";
import logger from "../utils/logger.js";

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
      tempData: { history: [], menuMap: [] },
    });
    await cart.save();
  }
  return cart;
};

/**
 * 2. Añadir ítem al carrito con validación de stock ATÓMICA.
 *
 * FIX RACE CONDITION: La versión anterior leía vendidas_hoy, calculaba
 * disponibilidad y luego guardaba — dejando una ventana donde dos usuarios
 * podían comprar el último ítem simultáneamente.
 *
 * La solución usa findOneAndUpdate con condición atómica en MongoDB:
 *   - La condición filtra por stock disponible REAL en el momento del update
 *   - Si la condición falla (stock insuficiente), devuelve null y reportamos SIN_STOCK
 *   - No hay ventana de tiempo entre lectura y escritura
 */
export const addItemToCart = async (whatsappId, businessId, itemDetails) => {
  const { itemId, quantity, opcionesSeleccionadas, notas, modifiers } =
    itemDetails;

  // Validación multi-tenant: el producto debe pertenecer a este negocio
  const itemData = await MenuItem.findOne({ _id: itemId, businessId });
  if (!itemData || !itemData.activo) {
    logger.warn(`[CartUtils] Producto inválido o inactivo: ${itemId}`);
    return { success: false, reason: "PRODUCTO_NO_DISPONIBLE" };
  }

  // Calculamos cuánto lleva ya el usuario de este producto en su carrito
  const cart = await getOrCreateCart(whatsappId, businessId);
  const cantidadEnCarrito = cart.items
    .filter((i) => i.itemId.toString() === itemId.toString())
    .reduce((acc, curr) => acc + curr.cantidad, 0);

  const stockDisponibleActual =
    itemData.cantidad_diaria - itemData.vendidas_hoy;

  if (cantidadEnCarrito + quantity > stockDisponibleActual) {
    return {
      success: false,
      reason: "SIN_STOCK",
      disponible: stockDisponibleActual - cantidadEnCarrito,
      name: itemData.nombre,
    };
  }

  // FIX: Incremento atómico de vendidas_hoy con condición de stock.
  // El operador $inc + condición en el filter hace la operación en un solo
  // round-trip a MongoDB. Si otro proceso ya consumió el stock entre nuestra
  // lectura y este update, la condición falla y devuelve null.
  const maxVendidasPermitidas = itemData.cantidad_diaria - quantity;
  const itemActualizado = await MenuItem.findOneAndUpdate(
    {
      _id: itemId,
      businessId,
      activo: true,
      // Condición atómica: solo actualiza si el stock sigue siendo suficiente
      vendidas_hoy: { $lte: maxVendidasPermitidas },
    },
    { $inc: { vendidas_hoy: quantity } },
    { new: true },
  );

  if (!itemActualizado) {
    // Alguien más compró el stock entre nuestra lectura y el update
    logger.warn(
      `[CartUtils] Stock agotado en operación atómica para ${itemData.nombre}`,
    );
    return {
      success: false,
      reason: "SIN_STOCK",
      disponible: 0,
      name: itemData.nombre,
    };
  }

  // Precio final: base + modificadores
  let precioFinalUnidad = itemData.precioBase;
  if (opcionesSeleccionadas?.length > 0) {
    precioFinalUnidad += opcionesSeleccionadas.reduce(
      (t, opt) => t + (opt.precioExtra || 0),
      0,
    );
  }

  // Agrupar si mismo producto + mismas opciones + mismas notas
  const itemIndex = cart.items.findIndex(
    (i) =>
      i.itemId.toString() === itemId.toString() &&
      JSON.stringify(i.opcionesSeleccionadas) ===
        JSON.stringify(opcionesSeleccionadas) &&
      (i.notas || "").trim() === (notas || "").trim() &&
      JSON.stringify(i.modifiers || []) === JSON.stringify(modifiers || []),
  );

  if (itemIndex > -1) {
    cart.items[itemIndex].cantidad += quantity;
  } else {
    console.log("[CartUtils] Guardando notas:", notas);

    cart.items.push({
      itemId,
      nombre: itemData.nombre,
      precioUnitario: precioFinalUnidad,
      cantidad: quantity,
      opcionesSeleccionadas: opcionesSeleccionadas || [],
      notas: notas || "",
      modifiers: modifiers || [],
    });
  }

  cart.totalCents = cart.items.reduce(
    (acc, item) => acc + item.precioUnitario * item.cantidad,
    0,
  );
  await cart.save();

  return {
    success: true,
    name: itemData.nombre,
    totalPrice: precioFinalUnidad * quantity,
  };
};

/**
 * 3. Actualizar estado y metadatos del carrito
 */
export const updateCart = async (whatsappId, businessId, updates) => {
  const cart = await getOrCreateCart(whatsappId, businessId);

  if (updates.conversationState)
    cart.conversationState = updates.conversationState;
  if (updates.tempData) {
    cart.tempData = { ...cart.tempData, ...updates.tempData };
    cart.markModified("tempData");
  }
  if (updates.items) {
    cart.items = updates.items;
    cart.totalCents = cart.items.reduce(
      (acc, item) => acc + item.precioUnitario * item.cantidad,
      0,
    );
  }

  await cart.save();
  return cart;
};

/**
 * 4. Eliminar ítem por índice
 */
export const removeItemByIndex = async (whatsappId, businessId, index) => {
  const cart = await ShoppingCart.findOne({ whatsappId, businessId });
  if (!cart || !cart.items[index])
    return { success: false, reason: "ITEM_NOT_FOUND" };

  const removedName = cart.items[index].nombre;
  cart.items.splice(index, 1);
  cart.totalCents = cart.items.reduce(
    (acc, item) => acc + item.precioUnitario * item.cantidad,
    0,
  );
  if (cart.items.length === 0) cart.conversationState = "INICIO";

  await cart.save();
  return { success: true, removedName, empty: cart.items.length === 0 };
};

/**
 * 5. Eliminar ítems por nombre (para Mateo IA — acción REMOVE)
 */
export const removeItemsByName = async (
  whatsappId,
  businessId,
  productName,
) => {
  const cart = await ShoppingCart.findOne({ whatsappId, businessId });
  if (!cart || cart.items.length === 0) return null;

  const nombreBusqueda = productName.toLowerCase();
  const itemsFiltrados = cart.items.filter((item) => {
    const itemNombre = item.nombre.toLowerCase();
    return (
      !itemNombre.includes(nombreBusqueda) &&
      !nombreBusqueda.includes(itemNombre)
    );
  });

  if (itemsFiltrados.length === cart.items.length) return cart;

  cart.items = itemsFiltrados;
  cart.totalCents = cart.items.reduce(
    (acc, item) => acc + item.precioUnitario * item.cantidad,
    0,
  );
  if (cart.items.length === 0) cart.conversationState = "INICIO";

  await cart.save();
  return cart;
};
