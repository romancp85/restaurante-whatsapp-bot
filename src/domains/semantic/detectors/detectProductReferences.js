import { normalizeText } from "../utils/normalizeText.js";
import logger from "../../../utils/logger.js";

const STOP_WORDS = [
  "hola",
  "buenas",
  "quiero",
  "me",
  "gustaria",
  "porfavor",
  "favor",
  "dame",
  "una",
  "uno",
  "unos",
  "unas",
  "el",
  "la",
  "los",
  "las",
  "de",
  "del",
];

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
    .map((word) => singularize(word.trim()))
    .filter(Boolean)
    .filter((word) => !STOP_WORDS.includes(word));
}

// =====================================================
// MAIN
// =====================================================

export function detectProductReferences({ text, menuMap = [] }) {
  const textTokens = tokenize(text);

  const detected = [];

  logger.debug(
    "[detectProductReferences] menuMap sample:",
    JSON.stringify(menuMap?.[0], null, 2),
  );

  // =====================================================
  // TOKEN FREQUENCY MAP
  // =====================================================

  const tokenFrequency = {};

  for (const item of menuMap) {
    const tokens = [
      ...tokenize(item.nombre),

      ...(Array.isArray(item.aliases)
        ? item.aliases.flatMap((alias) => tokenize(alias))
        : []),
    ];

    const uniqueTokens = [...new Set(tokens)];

    for (const token of uniqueTokens) {
      tokenFrequency[token] = (tokenFrequency[token] || 0) + 1;
    }
  }

  for (const item of menuMap) {
    // =====================================================
    // PRODUCT TOKENS
    // =====================================================

    const productTokens = item.semanticTokens || [];

    // evitar duplicados
    const uniqueProductTokens = [...new Set(productTokens)];

    // =====================================================
    // MATCHING
    // =====================================================

    const matchedWords = uniqueProductTokens.filter((token) =>
      textTokens.includes(token),
    );

    if (!matchedWords.length) {
      continue;
    }

    // =====================================================
    // SCORE ENGINE
    // =====================================================

    let rarityScore = 0;

    for (const token of matchedWords) {
      const frequency = tokenFrequency[token] || 1;

      // mientras más raro, más vale
      rarityScore += 1 / frequency;
    }

    const coverageScore =
      matchedWords.length / Math.max(uniqueProductTokens.length, 1);

    // bonus pequeño si encontró tokens específicos
    const rarityBonus = rarityScore * 0.35;

    const finalScore = Math.min(coverageScore + rarityBonus, 1);

    // =====================================================
    // BUILD CANDIDATE
    // =====================================================

    detected.push({
      type: "PRODUCT_CANDIDATE",

      value: item.nombre,

      score: finalScore,

      matchedWords,

      coverageScore,

      rarityScore,
    });
  }

  // =====================================================
  // SORT
  // =====================================================

  detected.sort((a, b) => b.score - a.score);

  logger.debug(
    "[detectProductReferences] detected:",
    JSON.stringify(detected, null, 2),
  );

  return detected;
}
