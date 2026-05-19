// src/services/aiService.js
import { analizarPedidoConIA } from "../utils/aiUtils.js";

/**
 * Servicio de Inteligencia: Traduce texto humano a intenciones de negocio.
 * Incluye traducción de índices y gestión de contexto post-venta.
 */
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

  const skipLegacyTranslator = semanticData?.operations?.length > 0;

  // 1. TRADUCTOR DE ÍNDICES (Lógica técnica agnóstica)
  let processedText = text;
  if (menuMap?.length > 0 && !skipLegacyTranslator) {
    const sortedMap = [...menuMap].sort((a, b) => b.index - a.index);
    sortedMap.forEach((item) => {
      const regex = new RegExp(
        `\\b(la|el|del|n\\.?|#|numero|posicion)?\\s*${item.index}\\b`,
        "gi",
      );
      const esSoloNumero = text.trim() === item.index.toString();

      if (regex.test(processedText) || esSoloNumero) {
        processedText = esSoloNumero
          ? item.nombre
          : processedText.replace(regex, ` ${item.nombre} `);
      }
    });
  }

  console.log(
    `[aiService] Texto Original: "${text}" | Traducido: "${processedText}"`,
  );

  // =====================================================
  // BYPASS IA SI EL SEMANTIC ENGINE YA ENTENDIÓ
  // =====================================================

  if (semanticData?.operations?.length > 0) {
    console.log("[aiService] Semantic Engine tomó prioridad. IA omitida.");

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
