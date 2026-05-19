import { normalizeText } from "../utils/normalizeText.js";

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

  console.log(
    "[detectProductReferences] menuMap sample:",
    JSON.stringify(menuMap?.[0], null, 2),
  );

  for (const item of menuMap) {
    // =====================================================
    // PRODUCT TOKENS
    // =====================================================

    const productTokens = [
      ...tokenize(item.nombre),

      ...(Array.isArray(item.aliases)
        ? item.aliases.flatMap((alias) => tokenize(alias))
        : []),
    ];

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

    const exactTokenMatches = matchedWords.length;

    const coverageScore =
      exactTokenMatches / Math.max(uniqueProductTokens.length, 1);

    // bonus fuerte por coincidencia directa
    const strongMatchBonus = exactTokenMatches >= 1 ? 0.45 : 0;

    const finalScore = Math.min(coverageScore + strongMatchBonus, 1);

    // =====================================================
    // BUILD CANDIDATE
    // =====================================================

    detected.push({
      type: "PRODUCT_CANDIDATE",

      value: item.nombre,

      score: finalScore,

      matchedWords,

      coverageScore,

      strongMatchBonus,
    });
  }

  // =====================================================
  // SORT
  // =====================================================

  detected.sort((a, b) => b.score - a.score);

  console.log(
    "[detectProductReferences] detected:",
    JSON.stringify(detected, null, 2),
  );

  return detected;
}
