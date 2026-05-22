// src/services/conversation/handleConversationState.js

import { updateCart, getOrCreateCart } from "../../whatsapp/cartUtils.js";

import { sendWhatsAppNotification } from "../notifyService.js";

import { ejecutarCheckoutInteligente } from "./checkoutFlow.js";

export async function handleConversationState({
  cart,
  text,
  userId,
  businessId,
  auth,
  restaurante,
}) {
  // =====================================================
  // PREGUNTANDO NOMBRE
  // =====================================================

  if (cart.conversationState === "PREGUNTANDO_NOMBRE") {
    await updateCart(userId, businessId, {
      tempData: {
        ...cart.tempData,
        name: text,
      },
    });

    await sendWhatsAppNotification(userId, `Perfecto ${text} 👍`, auth);

    // IMPORTANTE:
    // recargar carrito REAL desde storage
    const updatedCart = await getOrCreateCart(userId, businessId);

    await ejecutarCheckoutInteligente(
      userId,
      businessId,
      updatedCart,
      auth,
      restaurante,
    );

    return true;
  }

  // =====================================================
  // NO MANEJADO
  // =====================================================

  return false;
}
