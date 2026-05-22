import { buildSemanticAliases } from "../builders/buildSemanticAliases.js";
import { buildModifierMap } from "../builders/buildModifierMap.js";

export function buildSemanticMenuMap(menuItems = []) {
  return menuItems.map((item, index) => ({
    index: index + 1,

    itemId: item._id.toString(),

    nombre: item.nombre,

    semanticTokens: buildSemanticAliases(item),

    modifierTokens: buildModifierMap(item),

    categoria: item.categoria || "",

    precio: item.precioBase || 0,
  }));
}
