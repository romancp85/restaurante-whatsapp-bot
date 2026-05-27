// src/utils/matchModifierOption.js

import { normalizeModifierValue } from "./normalizeModifierValue.js";

const normalizeText = (txt = "") => {
  return txt
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
};

export const matchModifierOption = (modifierValue = "", opciones = []) => {
  const target = normalizeModifierValue(modifierValue);

  if (!target) {
    return null;
  }

  // =====================================================
  // EXACT MATCH
  // =====================================================

  let exact = opciones.find((o) => {
    return normalizeText(o.nombre) === target;
  });

  if (exact) {
    return exact;
  }

  // =====================================================
  // WORD MATCH
  // queso -> queso cheddar
  // =====================================================

  let wordMatch = opciones.find((o) => {
    const normalized = normalizeText(o.nombre);

    return normalized.split(" ").includes(target);
  });

  if (wordMatch) {
    return wordMatch;
  }

  return null;
};
