// src/services/cartService.js
import {
  getOrCreateCart,
  updateCart,
  addItemToCart,
  removeItemsByName,
} from "../whatsapp/cartUtils.js";
import { validarPedido } from "./orderValidator.js";
import { logger } from "../utils/logger.js";

/**
 * Procesa una lista de intenciones (ADD/REMOVE) y actualiza el carrito real.
 * @returns {Object} { cart, alerts } - El carrito actualizado y notas de stock si hubo problemas.
 */
export const processCartActions = async (userId, businessId, items) => {
  let alerts = "";

  if (!items || items.length === 0) {
    const cart = await getOrCreateCart(userId, businessId);
    return { cart, alerts };
  }

  for (const item of items) {
    if (item.action === "REMOVE") {
      logger.debug(`[cartService] 🗑️ Removiendo: ${item.productName}`);
      await removeItemsByName(userId, businessId, item.productName);
    } else {
      logger.debug(`[cartService] ➕ Intentando añadir: ${item.productName}`);
      // Validamos existencia en el catálogo y precios
      logger.debug("[cartService] Item completo: ", { item });
      //Aqui cambie el log para mostrar el item completo, antes solo mostraba el nombre del producto, con esto podemos ver toda la info del item que llega a esta parte del código, así podemos debuggear mejor los problemas de validación que puedan surgir.
      const { itemsValidados } = await validarPedido([item], businessId);

      if (itemsValidados && itemsValidados.length > 0) {
        // Intentamos meter al almacén (aquí se valida el stock real)
        const resStock = await addItemToCart(
          userId,
          businessId,
          itemsValidados[0],
        );

        if (!resStock.success && resStock.reason === "SIN_STOCK") {
          alerts +=
            resStock.disponible > 0
              ? `\n\n⚠️ *Nota:* De ${resStock.name} solo quedan ${resStock.disponible} unidades. Por ahora no lo agregué.`
              : `\n\n⚠️ *Nota:* Lo sentimos, ${resStock.name} se ha agotado por hoy.`;
        }
      }
    }
  }

  // Refrescamos el carrito una sola vez al finalizar todas las operaciones
  const finalCart = await getOrCreateCart(userId, businessId);
  return { cart: finalCart, alerts };
};
