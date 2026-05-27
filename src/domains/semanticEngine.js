import { extractReferences } from "./semantic/detectors/extractReferences.js";
import { detectProductReferences } from "./semantic/detectors/detectProductReferences.js";
import { inferOperations } from "./semantic/parsers/inferOperations.js";
//import { inferModifiers } from "./semantic/detectors/inferModifiers.js";
import { resolveContextReference } from "./semantic/detectors/resolveContextReference.js";
import { executeSemanticOperations } from "./semantic/engine/executeSemanticOperations.js";

import { rankProductCandidates } from "./semantic/ranking/rankProductCandidates.js";

import { segmentIntents } from "./semantic/parsers/intentSegmenter.js";
import { logger } from "../utils/logger.js";

// =====================================================
// HELPERS
// =====================================================

const safeArray = (v) => (Array.isArray(v) ? v : []);

const safeString = (v) => (typeof v === "string" ? v : "");

const safeObject = (v) => (v && typeof v === "object" ? v : {});

// =====================================================
// MAIN ENGINE
// =====================================================

export async function processSemanticMessage({
  text = "",
  menuMap = [],
  cart = {},
}) {
  const safeText = safeString(text);

  const safeMenuMap =
    Array.isArray(menuMap) && menuMap.length > 0
      ? menuMap
      : Array.isArray(cart?.tempData?.menuMap)
        ? cart.tempData.menuMap
        : [];

  const COMPLEX_PATTERNS = [
    /una con/i,
    /una sin/i,
    /otra con/i,
    /otra sin/i,

    /primera/i,
    /segunda/i,
    /tercera/i,

    /\d+\s+con/i,
    /\d+\s+sin/i,

    /adem[aá]s/i,
    /sin\s+\w+/i,
    /extra\s+\w+/i,

    /mitad/i,
    /agrega/i,
    /combo/i,
    /separad[oa]/i,
    /distint[oa]s/i,
  ];

  const normalizedText = safeText.toLowerCase();

  const isComplexMessage = COMPLEX_PATTERNS.some((pattern) =>
    pattern.test(normalizedText),
  );

  if (isComplexMessage) {
    logger.info("[SemanticEngine] Mensaje complejo detectado. Delegando a IA.");

    return {
      semanticItems: [],
      operations: [],
      references: [],
      contextReference: null,
    };
  }

  // =====================================================
  // SEGMENTATION
  // =====================================================

  const segments = segmentIntents(safeText);

  let operations = [];

  let references = [];

  // =====================================================
  // PROCESS SEGMENTS
  // =====================================================

  for (const chunk of segments) {
    if (!chunk) continue;

    logger.debug("[SemanticEngine] Chunk:", { chunk });

    // =====================================================
    // INDEX REFERENCES
    // =====================================================

    let chunkIndexReferences = [];

    try {
      chunkIndexReferences = safeArray(extractReferences(chunk));
    } catch (err) {
      logger.error("[SemanticEngine] extractReferences:", err.message);
    }

    // =====================================================
    // PRODUCT DETECTION
    // =====================================================

    let productCandidates = [];

    try {
      productCandidates = safeArray(
        detectProductReferences({
          text: chunk,
          menuMap: safeMenuMap,
        }),
      );
      logger.debug("[SemanticEngine] productCandidates:", {
        productCandidates,
      });
    } catch (err) {
      logger.error("[SemanticEngine] detectProductReferences:", err.message);
    }

    // =====================================================
    // RANKING
    // =====================================================

    let ranking = {
      topCandidates: [],
      decision: "NONE",
    };

    try {
      ranking = rankProductCandidates({
        candidates: productCandidates,
      });
      logger.debug("[SemanticEngine] ranking:", { ranking });
    } catch (err) {
      logger.error("[SemanticEngine] ranking:", err.message);
    }

    // =====================================================
    // BUILD PRODUCT REFERENCES
    // =====================================================

    const chunkProductReferences = [];

    // WINNER
    if (ranking.decision === "WINNER") {
      const winner = ranking.topCandidates[0];

      chunkProductReferences.push({
        type: "product_name",

        value: winner.value,

        score: winner.score,
      });
    }

    // AMBIGUOUS
    else if (ranking.decision === "AMBIGUOUS") {
      references.push({
        type: "ambiguous_product",

        query: chunk,

        candidates: ranking.topCandidates,
      });

      continue;
    }

    // =====================================================
    // MERGE REFERENCES
    // =====================================================

    const chunkReferences = [
      ...chunkIndexReferences,
      ...chunkProductReferences,
    ];

    references.push(...chunkReferences);

    // =====================================================
    // OPERATIONS
    // =====================================================

    let chunkOperations = [];

    try {
      chunkOperations = safeArray(
        inferOperations(chunk, chunkReferences, menuMap),
      );
    } catch (err) {
      logger.error("[SemanticEngine] inferOperations:", err.message);
    }

    logger.debug("[SemanticEngine] Operations:", { chunkOperations });

    operations.push(...chunkOperations);
  }

  // =====================================================
  // AMBIGUOUS FLOW
  // =====================================================

  const ambiguousReference = references.find(
    (ref) => ref.type === "ambiguous_product",
  );

  if (ambiguousReference) {
    return {
      semanticItems: [],

      operations: [],

      references,

      contextReference: null,

      ambiguous: {
        query: ambiguousReference.query,

        candidates: ambiguousReference.candidates,
      },
    };
  }

  // =====================================================
  // CONTEXT REFERENCE
  // =====================================================

  let contextReference = null;

  try {
    contextReference = resolveContextReference({
      text: safeText,

      cart: safeObject(cart),

      menuMap: safeMenuMap,
    });
  } catch (err) {
    logger.error("[SemanticEngine] context:", err.message);
  }

  // =====================================================
  // EXECUTION
  // =====================================================

  let semanticItems = [];

  try {
    semanticItems = safeArray(
      await executeSemanticOperations({
        operations,

        menuMap: safeMenuMap,
      }),
    );
  } catch (err) {
    logger.error("[SemanticEngine] execute:", err.message);
  }

  // =====================================================
  // CONTEXT FALLBACK
  // =====================================================

  if (semanticItems.length === 0 && contextReference?.productName) {
    semanticItems = [
      {
        action: "add",

        productName: contextReference.productName,

        quantity: 1,
      },
    ];
  }

  // =====================================================
  // RESULT
  // =====================================================

  return {
    semanticItems,

    operations,

    references,

    contextReference,
  };
}
