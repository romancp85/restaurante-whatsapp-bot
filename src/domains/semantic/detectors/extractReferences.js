import { normalizeText } from "../utils/normalizeText.js";

/**
 * Detecta referencias a índices de menú SIN modificar el texto.
 */

function extractReferences(text = "") {
  const normalized = normalizeText(text);

  const references = [];

  const regex = /(?:la|el|del|de la|#|n\.?|numero|opcion|item)\s*(\d+)/gi;

  let match;

  while ((match = regex.exec(normalized)) !== null) {
    references.push({
      type: "menu_index",
      raw: match[0],
      value: Number(match[1]),
    });
  }

  // Caso especial:
  // mensaje solo contiene número

  if (/^\d+$/.test(normalized)) {
    references.push({
      type: "menu_index",
      raw: normalized,
      value: Number(normalized),
      standalone: true,
    });
  }

  return references;
}

export { extractReferences };
