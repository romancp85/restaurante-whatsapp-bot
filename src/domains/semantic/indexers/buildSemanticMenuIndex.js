import { normalizeText } from "../utils/normalizeText.js";

const STOPWORDS = ["de", "la", "el", "con", "y", "del"];

export function buildSemanticMenuIndex(menuMap = []) {
  const tokenFrequency = new Map();

  const tokenIndex = new Map();

  const semanticGroups = new Map();

  const products = [];

  for (const item of menuMap) {
    const normalizedName = normalizeText(item.nombre);

    const tokens = normalizedName
      .split(" ")
      .filter((token) => token.length > 2 && !STOPWORDS.includes(token));

    // =========================================
    // TOKEN FREQUENCY
    // =========================================

    for (const token of tokens) {
      tokenFrequency.set(token, (tokenFrequency.get(token) || 0) + 1);

      if (!tokenIndex.has(token)) {
        tokenIndex.set(token, []);
      }

      tokenIndex.get(token).push(item.id);
    }

    products.push({
      id: item.id,
      nombre: item.nombre,
      normalizedName,
      tokens,
      original: item,
    });
  }

  // =========================================
  // SEMANTIC GROUP DETECTION
  // =========================================

  for (const product of products) {
    let bestGroup = null;

    let bestFrequency = 0;

    for (const token of product.tokens) {
      const frequency = tokenFrequency.get(token);

      if (frequency > bestFrequency) {
        bestFrequency = frequency;
        bestGroup = token;
      }
    }

    product.semanticGroup = bestGroup;

    if (!semanticGroups.has(bestGroup)) {
      semanticGroups.set(bestGroup, []);
    }

    semanticGroups.get(bestGroup).push(product);
  }

  return {
    products,

    tokenFrequency,

    tokenIndex,

    semanticGroups,
  };
}
