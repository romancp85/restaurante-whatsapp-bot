import { normalizeText } from "../utils/normalizeText.js";

// =====================================================
// HELPERS
// =====================================================

function singularize(word = "") {
  return word.replace(/es$/i, "").replace(/s$/i, "");
}

function tokenize(text = "") {
  return normalizeText(text)
    .replace(/-/g, " ")
    .split(/\s+/)
    .map((w) => singularize(w.trim()))
    .filter(Boolean);
}

function unique(arr = []) {
  return [...new Set(arr)];
}

// =====================================================
// SEMANTIC RULES
// =====================================================

function buildPizzaAliases(nombre) {
  const aliases = [];

  const normalized = normalizeText(nombre);

  const withoutPizza = normalized.replace(/^pizza\s+/i, "");

  aliases.push("pizza");

  aliases.push(withoutPizza);

  aliases.push(`pizza ${withoutPizza}`);

  aliases.push(`pizza de ${withoutPizza}`);

  // typo común
  if (withoutPizza.includes("pepperoni")) {
    aliases.push("peperoni");
    aliases.push("pizza peperoni");
  }

  return aliases;
}

function buildBurgerAliases(nombre) {
  const aliases = [];

  const normalized = normalizeText(nombre);

  aliases.push("hamburguesa");

  aliases.push("burger");

  aliases.push(normalized);

  return aliases;
}

function buildDrinkAliases(nombre) {
  const aliases = [];

  const normalized = normalizeText(nombre);

  aliases.push(normalized);

  if (normalized.includes("coca")) {
    aliases.push("coca");
    aliases.push("coca cola");
    aliases.push("cocacola");
    aliases.push("cola");
    aliases.push("refresco");
    aliases.push("coke");
  }

  if (normalized.includes("fanta")) {
    aliases.push("fanta");
    aliases.push("refresco");
  }

  return aliases;
}

// =====================================================
// MAIN
// =====================================================

export function buildSemanticAliases(item) {
  const nombre = item?.nombre || "";

  const categoria = normalizeText(item?.categoria || "");

  let aliases = [];

  // =====================================================
  // BASE
  // =====================================================

  aliases.push(normalizeText(nombre));

  tokenize(nombre).forEach((token) => {
    aliases.push(normalizeText(token));
  });

  // =====================================================
  // CATEGORY RULES
  // =====================================================

  if (categoria.includes("pizza")) {
    aliases.push(...buildPizzaAliases(nombre));
  }

  if (categoria.includes("hamburguesa") || categoria.includes("burger")) {
    aliases.push(...buildBurgerAliases(nombre));
  }

  if (categoria.includes("bebida") || categoria.includes("refresco")) {
    aliases.push(...buildDrinkAliases(nombre));
  }

  // =====================================================
  // CLEAN
  // =====================================================

  aliases = aliases.map((a) => normalizeText(a)).filter(Boolean);

  aliases = unique(aliases);

  return aliases;
}
