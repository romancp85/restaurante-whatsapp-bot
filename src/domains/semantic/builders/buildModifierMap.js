import { normalizeText } from "../utils/normalizeText.js";

function unique(arr = []) {
  return [...new Set(arr)];
}

function tokenize(text = "") {
  return normalizeText(text)
    .replace(/-/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean);
}

export function buildModifierMap(item) {
  const modifierMap = [];

  const grupos = item.modificadores || [];

  for (const grupo of grupos) {
    for (const opcion of grupo.opciones || []) {
      const nombre = opcion.nombre;

      let aliases = [];

      // =====================================================
      // BASE
      // =====================================================

      aliases.push(nombre);

      // tokenización individual
      tokenize(nombre).forEach((token) => {
        aliases.push(token);
      });

      // =====================================================
      // SEMANTIC RULES
      // =====================================================

      const normalized = normalizeText(nombre);

      if (normalized.includes("queso")) {
        aliases.push("extra queso");
        aliases.push("queso");
      }

      if (normalized.includes("tocino")) {
        aliases.push("tocino");
        aliases.push("bacon");
      }

      if (normalized.includes("champ")) {
        aliases.push("champiñones");
        aliases.push("champiñon");
      }

      // =====================================================
      // CLEAN
      // =====================================================

      aliases = aliases.map((a) => normalizeText(a)).filter(Boolean);

      aliases = unique(aliases);

      modifierMap.push({
        original: nombre,
        tokens: aliases,
      });
    }
  }

  return modifierMap;
}
