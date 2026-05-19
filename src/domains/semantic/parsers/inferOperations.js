/**
 * Detecta operaciones conversacionales estructuradas.
 */

const NUMBER_WORDS = {
  un: 1,
  una: 1,
  uno: 1,

  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
};

// =====================================================
// HELPERS
// =====================================================

function normalizeSemanticText(text = "") {
  return text
    .toLowerCase()
    .replace(
      /\b(un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\b/gi,
      (match) => NUMBER_WORDS[match.toLowerCase()] || match,
    );
}

function extractQuantityNearToken({ semanticText, tokens = [] }) {
  for (const token of tokens) {
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    /**
     * Casos:
     *
     * 2 cocas
     * 3 hamburguesas
     * 2x pizza
     * 4 de pizza
     */

    const regex = new RegExp(
      `(\\d+)\\s*(?:x)?\\s*(?:de)?\\s*${escaped}s?`,
      "i",
    );

    const match = semanticText.match(regex);

    if (match) {
      return Number(match[1]);
    }
  }

  return 1;
}

// =====================================================
// MAIN
// =====================================================

function inferOperations(text = "", references = [], modifiers = []) {
  const operations = [];

  const semanticText = normalizeSemanticText(text);

  let match;

  // =====================================================
  // 1. OPERACIONES POR ÍNDICE
  // =====================================================

  /**
   * 2 de la 3
   */

  const regexCantidadReferencia = /(\d+)\s+de\s+(?:la|el)?\s*(\d+)/gi;

  while ((match = regexCantidadReferencia.exec(semanticText)) !== null) {
    operations.push({
      type: "ADD_ITEM",

      quantity: Number(match[1]),

      reference: {
        type: "menu_index",
        value: Number(match[2]),
      },

      modifiers,

      raw: match[0],
    });
  }

  /**
   * 3x la 2
   */

  const regexMultiplicador = /(\d+)x\s*(?:la|el)?\s*(\d+)/gi;

  while ((match = regexMultiplicador.exec(semanticText)) !== null) {
    operations.push({
      type: "ADD_ITEM",

      quantity: Number(match[1]),

      reference: {
        type: "menu_index",
        value: Number(match[2]),
      },

      modifiers,

      raw: match[0],
    });
  }

  // =====================================================
  // 2. PRODUCT REFERENCES
  // =====================================================

  const productReferences = references.filter(
    (ref) => ref.type === "product_name",
  );

  console.log("[inferOperations] productReferences:", productReferences);

  const processedProducts = new Set();

  for (const productRef of productReferences) {
    if (!productRef?.value) {
      continue;
    }

    if (processedProducts.has(productRef.value)) {
      continue;
    }

    processedProducts.add(productRef.value);

    // =====================================================
    // TOKENS
    // =====================================================

    const normalizedProduct = productRef.value.toLowerCase().replace(/-/g, " ");

    const semanticTokens = normalizedProduct
      .split(" ")
      .filter((word) => word.length > 2);

    // =====================================================
    // QUANTITY
    // =====================================================

    const quantity = extractQuantityNearToken({
      semanticText,
      tokens: semanticTokens,
    });

    // =====================================================
    // OPERATION
    // =====================================================

    operations.push({
      type: "ADD_ITEM",

      quantity,

      reference: {
        type: "product_name",
        value: productRef.value,
      },

      modifiers,

      raw: productRef.value,
    });
  }

  // =====================================================
  // CLEAN INVALID OPERATIONS
  // =====================================================

  const validOperations = operations.filter((operation) => {
    if (!operation.reference) {
      return false;
    }

    if (!operation.quantity || operation.quantity <= 0) {
      return false;
    }

    return true;
  });

  console.log(
    "[inferOperations] operations:",
    JSON.stringify(validOperations, null, 2),
  );

  return validOperations;
}

export { inferOperations };
