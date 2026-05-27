import Pedido from "../../models/Pedido.js";

import { sendWhatsAppNotification, notifyDashboard } from "../notifyService.js";

import { updateCart } from "../../whatsapp/cartUtils.js";

import CONVERSATION_STATES from "../../constants/conversationStates.js";

export const handleImageMessage = async ({
  userId,
  businessId,
  auth,
  cart,
}) => {
  if (cart.conversationState === CONVERSATION_STATES.ESPERANDO_COMPROBANTE) {
    const pedido = await Pedido.findOne({
      telefonoCliente: userId,
      estado: "Pendiente de Pago",
    }).sort({ createdAt: -1 });

    if (pedido) {
      pedido.comentarios =
        (pedido.comentarios || "") + " | [SISTEMA: Comprobante enviado]";

      await pedido.save();

      notifyDashboard(businessId, pedido);

      await updateCart(userId, businessId, {
        conversationState: CONVERSATION_STATES.POST_VENTA,
      });

      return await sendWhatsAppNotification(
        userId,
        "¡Gracias! He recibido tu comprobante. 📸 Un agente lo validará pronto. 😊",
        auth,
      );
    }
  }

  return await sendWhatsAppNotification(
    userId,
    "¡Gracias por la imagen! Si necesitas pedir algo, solo dime. 🍔",
    auth,
  );
};
