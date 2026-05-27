// src/services/flowService.js
import { getUltimoPedido, generarPropuestaVIP } from "./loyaltyService.js";
import { sendMenu } from "../whatsapp/utils.js";
import { sendWhatsAppNotification } from "./notifyService.js";
import { updateCart } from "../whatsapp/cartUtils.js";
import logger from "../utils/logger.js";

logger.info("[Flow]--- ✅ MÓDULO flowService.js CARGADO ---");

const SALUDOS = [
  "HOLA",
  "OLA",
  "BUENAS",
  "BUENOS DIAS",
  "BUENAS TARDES",
  "BUENAS NOCHES",
  "MENU",
  "MENÚ",
  "ME PUEDES MOSTRAR EL MENU",
  "QUE VENDEN",
  "INFO",
];
const CORTESIA = [
  "GRACIAS",
  "OK",
  "DALE",
  "ESTA BIEN",
  "ENTENDIDO",
  "PERFECTO",
  "LISTO",
  "👍",
  "BYE",
  "ADIOS",
  "EXCELENTE",
  "MUCHAS GRACIAS",
  "YA QUEDO",
];
const FEEDBACK_NEGATIVO = [
  "FALTO",
  "FALTA",
  "MALO",
  "FRIO",
  "SALSA",
  "TARDE",
  "EQUIVOCADO",
  "ERROR",
  "NO LLEGO",
  "POCA",
  "POCO",
];

export const handleInitialFlow = async (
  userId,
  businessId,
  text,
  cart,
  auth,
  lastOrder = null,
) => {
  const normalizedText = text.toUpperCase().trim();
  const currentState = cart.conversationState;
  const history = cart.tempData.history || [];

  // 🛡️ 1. DETECTOR DE QUEJAS
  const esQueja = FEEDBACK_NEGATIVO.some((k) => normalizedText.includes(k));
  if (esQueja && lastOrder && currentState === "POST_VENTA") {
    const disculpa = `Lamento mucho el inconveniente con tu pedido *#${lastOrder.numero_pedido}*, ${lastOrder.nombreCliente}. 😔\n\nHe reportado tu mensaje sobre "${text}" al equipo para que lo revisen ahora mismo. ¿Puedo ayudarte con algo más?`;
    await sendWhatsAppNotification(userId, disculpa, auth);
    return true;
  }

  // 💰 2. FILTRO DE CORTESÍA (Ahorro IA)
  const esCortesia = CORTESIA.includes(normalizedText);
  const esEmoji = text.length <= 2 && /[\u{1F300}-\u{1F9FF}]/u.test(text);

  if (esCortesia || esEmoji) {
    let respuesta = "¡Con gusto! Quedo pendiente de tu pedido. 😊";
    if (lastOrder) {
      respuesta =
        lastOrder.estado === "Pendiente de Pago"
          ? `¡De nada! Sigo a la espera de tu comprobante para procesar la orden *#${lastOrder.numero_pedido}*. 📸`
          : `¡Un placer! Tu orden *#${lastOrder.numero_pedido}* ya está en proceso. 👨‍🍳`;
    }
    await sendWhatsAppNotification(userId, respuesta, auth);
    return true;
  }

  // 🕒 3. MANEJO DE SEGUIMIENTO / COMPROBANTE
  if (lastOrder && text.length < 40) {
    const lowerText = text.toLowerCase();
    const keywordsStatus = [
      "donde",
      "viene",
      "estatus",
      "pedido",
      "orden",
      "va",
      "falta",
      "confirmar",
      "llega",
      "tarda",
    ];
    if (keywordsStatus.some((k) => lowerText.includes(k))) {
      let statusMsg = `Tu pedido *#${lastOrder.numero_pedido}* está: *${lastOrder.estado}*.\n\n`;
      statusMsg +=
        lastOrder.estado === "Pendiente de Pago"
          ? "Recuerda enviarme la foto de tu comprobante para cocinar. 📸"
          : "Te avisaremos por aquí cualquier actualización. 🛵";
      await sendWhatsAppNotification(userId, statusMsg, auth);
      return true;
    }

    if (
      currentState === "ESPERANDO_COMPROBANTE" &&
      text.length < 20 &&
      !lowerText.includes("menu")
    ) {
      const reminderMsg = `He recibido tu mensaje, pero aún necesito la *foto del comprobante* 📸 para validar tu pago del pedido *#${lastOrder.numero_pedido}*.\n\n_Si quieres pedir algo nuevo, escribe *MENÚ*._`;
      await sendWhatsAppNotification(userId, reminderMsg, auth);
      return true;
    }
  }

  // 🤝 4. REINICIO DE CONVERSACIÓN (VIP / MENÚ)
  const esSaludo = SALUDOS.some(
    (saludo) => normalizedText === saludo || normalizedText.startsWith(saludo),
  );
  const esMensajeCorto = text.length < 10;

  // 🌟 REGLA DE ORO (FIX CLIENTE 1):
  // Solo permitimos el flujo de bienvenida si el estado es 'INICIO' o 'POST_VENTA'.
  // Si el estado es 'MOSTRANDO_MENU' o cualquier otro, ignoramos este bloque para no ciclar al cliente.
  const estadosDeBienvenida = ["INICIO", "POST_VENTA"];
  const esEstadoInicialValido = estadosDeBienvenida.includes(currentState);

  logger.debug("[flowService]", {
    esSaludo,
    esMensajeCorto,
    currentState,
    cartItems: cart.items.length,
  });

  if (
    cart.items.length === 0 &&
    esEstadoInicialValido &&
    (esMensajeCorto || esSaludo)
  ) {
    logger.info(
      `[flowService] 👋 Manejando inicio legal (Estado: ${currentState}).`,
    );

    const ultimo = await getUltimoPedido(userId, businessId);
    const propuesta = generarPropuestaVIP(ultimo);

    if (propuesta && currentState !== "PROPUESTA_VIP") {
      await updateCart(userId, businessId, {
        conversationState: "PROPUESTA_VIP",
      });
      await sendWhatsAppNotification(
        userId,
        {
          type: "interactive",
          interactive: {
            type: "button",
            body: { text: propuesta.texto },
            action: {
              buttons: [
                {
                  type: "reply",
                  reply: { id: "REPETIR_PEDIDO", title: "✅ Sí, lo mismo" },
                },
                {
                  type: "reply",
                  reply: { id: "MENU_NUEVO", title: "📋 Ver Menú" },
                },
              ],
            },
          },
        },
        auth,
      );
      return true;
    }

    // Si no hay pedido anterior o ya pasó el filtro, mandamos menú y CAMBIAMOS ESTADO
    await updateCart(userId, businessId, {
      conversationState: "MOSTRANDO_MENU",
    });
    await sendMenu(userId, businessId, auth, cart);
    return true;
  }

  return false; // Pasar a Mateo IA
};
