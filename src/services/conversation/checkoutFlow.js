// src/services/conversation/checkoutFlow.js

import { updateCart } from "../../whatsapp/cartUtils.js";

import {
  sendMenu,
  sendPaymentMethodOptions,
  sendCartSummary,
} from "../../whatsapp/utils.js";

import { sendWhatsAppNotification } from "../notifyService.js";

export const ejecutarCheckoutInteligente = async (
  userId,
  businessId,
  cart,
  auth,
  restaurante,
) => {
  // =====================================================
  // SIN ITEMS
  // =====================================================

  if (!cart.items || cart.items.length === 0) {
    return await sendMenu(userId, businessId, auth, cart);
  }

  const { tempData } = cart;

  // =====================================================
  // DELIVERY / PICKUP
  // =====================================================

  if (!tempData.deliveryMode) {
    await updateCart(userId, businessId, {
      conversationState: "PREGUNTANDO_MODO_ENTREGA",
    });

    return await sendWhatsAppNotification(
      userId,
      {
        type: "interactive",

        interactive: {
          type: "button",

          body: {
            text: "Excelente elección. 🍽️ ¿Cómo gustas recibir tu pedido?",
          },

          action: {
            buttons: [
              {
                type: "reply",

                reply: {
                  id: "MODE_DELIVERY",
                  title: "A domicilio 🛵",
                },
              },
              {
                type: "reply",

                reply: {
                  id: "MODE_PICKUP",
                  title: "Recoger en tienda 🛍️",
                },
              },
            ],
          },
        },
      },
      auth,
    );
  }

  // =====================================================
  // NOMBRE
  // =====================================================

  if (!tempData.name || tempData.name.length < 2) {
    await updateCart(userId, businessId, {
      conversationState: "PREGUNTANDO_NOMBRE",
    });

    return await sendWhatsAppNotification(
      userId,
      "¡Perfecto! ¿A nombre de quién registro el pedido? 👤",
      auth,
    );
  }

  // =====================================================
  // DIRECCIÓN
  // =====================================================

  if (tempData.deliveryMode === "DELIVERY" && !tempData.address) {
    await updateCart(userId, businessId, {
      conversationState: "PREGUNTANDO_DIRECCION",
    });

    return await sendWhatsAppNotification(
      userId,
      "Para el envío, ¿cuál es tu dirección exacta? (O envía tu ubicación 📍)",
      auth,
    );
  }

  // =====================================================
  // MÉTODO DE PAGO
  // =====================================================

  if (!tempData.paymentMethod) {
    await updateCart(userId, businessId, {
      conversationState: "PREGUNTANDO_PAGO",
    });

    return await sendPaymentMethodOptions(userId, businessId, auth);
  }

  // =====================================================
  // CONFIRMACIÓN FINAL
  // =====================================================

  await updateCart(userId, businessId, {
    conversationState: "CONFIRMANDO_PEDIDO",
  });

  return await sendCartSummary(userId, cart, businessId, auth);
};
