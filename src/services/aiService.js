// src/services/aiService.js
import { analizarPedidoConIA } from "../utils/aiUtils.js";
import { logger } from "../utils/logger.js";

/**
 * Servicio de Inteligencia: Traduce texto humano a intenciones de negocio.
 * Incluye traducción de índices y gestión de contexto post-venta.
 */

const COMPLEX_PATTERNS = [
  /una con/i,
  /una sin/i,
  /otra con/i,
  /otra sin/i,
  /adem[aá]s/i,
  /extra/i,
  /sin\s+\w+/i,
  /mitad/i,
  /agrega/i,
  /quitale/i,
  /qu[ií]tale/i,
  /pero/i,
  /combo/i,
  /separad[oa]/i,
  /distint[oa]s/i,
];

const isComplexMessage = (text = "") => {
  return COMPLEX_PATTERNS.some((pattern) => pattern.test(text));
};

export const getIntention = async (text, context, semanticData = {}) => {
  const {
    history,
    menuMap,
    businessId,
    restauranteConfig,
    lastProductDiscussed,
    lastOrder, // 👈 Nuevo: Referencia al último pedido
    cartState, // 👈 Nuevo: Estado actual de la conversación
  } = context;

  // NUEVO:
  // Si el nuevo motor semántico ya entendió el mensaje,
  // evitamos usar el traductor legacy destructivo.

  const isComplex = isComplexMessage(text);

  const skipLegacyTranslator =
    semanticData?.operations?.length > 0 && !isComplex;

  // 1. TRADUCTOR DE ÍNDICES (Lógica técnica agnóstica)

  let processedText = text;

  /**
   * IMPORTANTE:
   * El traductor legacy SOLO debe activarse
   * cuando el usuario claramente hace referencia
   * a un índice visual del menú.
   *
   * Ejemplos válidos:
   * - "quiero el 2"
   * - "#3"
   * - "producto 4"
   * - "opción 5"
   *
   * Ejemplos que NO deben traducirse:
   * - "2 hamburguesas"
   * - "3 cocas"
   * - "4 tacos"
   *
   * Esto evita confundir cantidades
   * con índices del catálogo.
   */

  if (menuMap?.length > 0 && !skipLegacyTranslator) {
    const sortedMap = [...menuMap].sort((a, b) => b.index - a.index);

    sortedMap.forEach((item) => {
      /**
       * NOTA:
       * El prefijo NO es opcional.
       *
       * Si el usuario no menciona explícitamente:
       * - menu
       * - menú
       * - numero
       * - #
       * - opcion
       * - producto
       *
       * entonces NO se interpreta como índice.
       */

      const regex = new RegExp(
        `\\b(?:menu|menú|numero|n\\.?|#|opcion|opción|producto)\\s*${item.index}\\b`,
        "gi",
      );

      if (regex.test(processedText)) {
        processedText = processedText.replace(regex, ` ${item.nombre} `);
      }
    });
  }

  logger.info(
    `[aiService] Texto Original: "${text}" | Traducido: "${processedText}"`,
  );

  // =====================================================
  // BYPASS IA SI EL SEMANTIC ENGINE YA ENTENDIÓ
  // =====================================================

  if (semanticData?.operations?.length > 0 && !isComplex) {
    logger.info("[aiService] Semantic Engine tomó prioridad. IA omitida.");

    return {
      items: [],
      status: "SEMANTIC_OK",
      waiterMessage: null,
      extractedData: {},
    };
  }

  // 2. 🌟 INYECCIÓN DE CONTEXTO POST-VENTA (Luxury Continuity)
  // Si el usuario está en fase de seguimiento, le damos instrucciones extra a Mateo
  let promptModificado = restauranteConfig;

  if (cartState === "POST_VENTA" || cartState === "ESPERANDO_COMPROBANTE") {
    const infoExtra = `
        \n⚠️ [REGLA CRÍTICA DE CONTINUIDAD]:
        - El pedido #${lastOrder?.numero_pedido || ""} ya fue entregado/cerrado.
        - El carrito actual está COMPLETAMENTE VACÍO.
        - NO asumas que el usuario quiere repetir productos del historial.
        - Si el usuario envía comentarios, agradecimientos o quejas, NO agregues nada al carrito.
        - SOLO agrega productos si el usuario los pide EXPLÍCITAMENTE por su nombre en este mensaje actual.
        `;
    promptModificado += infoExtra;
  }

  // 3. LLAMADA AL MOTOR DE IA (MATEO)
  const aiResponse = await analizarPedidoConIA(
    processedText,
    businessId,
    history,
    promptModificado, // 👈 Enviamos el prompt con el "secreto" de la venta reciente
    lastProductDiscussed,
    menuMap,
  );

  return aiResponse;
};
