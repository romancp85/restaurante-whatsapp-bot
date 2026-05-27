// src/utils/normalizeModifierValue.js

const normalizeText = (txt = "") => {
  return txt
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
};

export function normalizeModifierValue(value = "") {
  const normalized = normalizeText(value);

  return normalized
    .replace(/\bextra\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
