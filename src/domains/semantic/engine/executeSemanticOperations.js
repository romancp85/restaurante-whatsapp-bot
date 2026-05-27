/**
 * Convierte operaciones semánticas
 * en acciones compatibles con processCartActions.
 */

import logger from "../../../utils/logger.js";

export async function executeSemanticOperations({
  operations = [],
  modifiers = [],
  menuMap = [],
}) {
  const items = [];

  logger.debug(
    "[SemanticOperations] Modifiers recibidos:",
    JSON.stringify(modifiers, null, 2),
  );

  for (const operation of operations) {
    if (operation.type !== "ADD_ITEM") {
      continue;
    }

    let menuItem = null;

    // =====================================================
    // REFERENCIA POR ÍNDICE
    // =====================================================

    if (operation.reference?.type === "menu_index") {
      const menuIndex = operation.reference.value;

      menuItem = menuMap.find((item) => item.index === menuIndex);
    }

    // =====================================================
    // REFERENCIA POR NOMBRE
    // =====================================================

    if (operation.reference?.type === "product_name") {
      menuItem = menuMap.find(
        (item) => item.nombre === operation.reference.value,
      );
    }

    if (!menuItem) {
      continue;
    }

    const notes = (operation.modifiers || []).map((m) => m.raw).join(", ");

    logger.debug(
      "[SemanticOperations] Modifiers asignados:",
      operation.modifiers || [],
    );

    logger.debug("[SemanticOperations] Item construido:", {
      action: "add",
      productName: menuItem.nombre,
      quantity: operation.quantity,
      modifiers: operation.modifiers || [],
      notes,
    });

    items.push({
      action: "add",

      productName: menuItem.nombre,

      quantity: operation.quantity || 1,

      modifiers: operation.modifiers || [],

      notes,
    });
  }

  return items;
}
