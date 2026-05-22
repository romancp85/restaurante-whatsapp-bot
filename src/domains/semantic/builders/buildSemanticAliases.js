import { normalizeText } from "../utils/normalizeText.js";
import { businessSemanticConfig } from "../config/businessSemanticConfig.js";

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
// MAIN
// =====================================================

export function buildSemanticAliases(item) {
  const nombre = item?.nombre || "";

  const normalizedName = normalizeText(nombre);

  const typoMap = businessSemanticConfig?.typoMap || [];

  const synonymMap = businessSemanticConfig?.synonymMap || [];

  const genericTokens = businessSemanticConfig?.genericTokens || [];

  let aliases = [];

  // =====================================================
  // BASE FULL NAME
  // =====================================================

  aliases.push(normalizedName);

  // =====================================================
  // TOKENS
  // =====================================================

  const tokens = tokenize(nombre);

  for (const token of tokens) {
    const normalizedToken = normalizeText(token);

    aliases.push(normalizedToken);

    // =====================================================
    // TYPO RULES
    // =====================================================

    for (const typoRule of typoMap) {
      if (typoRule.canonical === normalizedToken) {
        aliases.push(...(typoRule.aliases || []));
      }
    }

    // =====================================================
    // SYNONYMS
    // =====================================================

    for (const synonymRule of synonymMap) {
      if (synonymRule.canonical === normalizedToken) {
        aliases.push(...(synonymRule.aliases || []));
      }
    }
  }

  // =====================================================
  // GENERIC TOKENS
  // =====================================================

  for (const genericToken of genericTokens) {
    if (normalizedName.includes(genericToken)) {
      aliases.push(genericToken);
    }
  }

  // =====================================================
  // CLEAN
  // =====================================================

  aliases = aliases.map((a) => normalizeText(a)).filter(Boolean);

  aliases = unique(aliases);

  return aliases;
}
