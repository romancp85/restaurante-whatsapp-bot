/**
 * Divide mensajes multi-producto
 * en segmentos semánticos independientes.
 */

export function segmentIntents(text = "") {
  if (!text || typeof text !== "string") {
    return [];
  }

  let normalized = text.replace(/\s+/g, " ").trim();

  // =====================================================
  // SEPARADORES CONVERSACIONALES
  // =====================================================

  normalized = normalized.replace(/\s+(y|ademas|tambien|más|mas)\s+/gi, " | ");

  normalized = normalized.replace(/\s*,\s*/g, " | ");

  // =====================================================
  // SPLIT
  // =====================================================

  const segments = normalized
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);

  return segments;
}
