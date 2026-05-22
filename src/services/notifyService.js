// src/services/notifyService.js

import { sendMessage } from "../whatsapp/utils.js";

export const sendWhatsAppNotification = async (userId, payload, auth) => {
  try {
    await sendMessage(userId, payload, auth);

    console.log(`✅ [notifyService] WhatsApp enviado a ${userId}`);
  } catch (error) {
    console.error(`❌ [notifyService] Error WhatsApp:`, error.message);
  }
};

export const notifyDashboard = (businessId, pedido) => {
  if (!global.io) {
    console.error("⚠️ [notifyService] Socket.io no detectado.");

    return;
  }

  try {
    const salaId = businessId.toString();

    const dataFinal = JSON.parse(JSON.stringify(pedido));

    global.io.to(salaId).emit("NUEVO_PEDIDO", dataFinal);

    console.log(`📢 [notifyService] Dashboard notificado en sala: ${salaId}`);
  } catch (error) {
    console.error(`❌ [notifyService] Error Socket:`, error.message);
  }
};

export const notifyOrderStatusUpdate = async (pedido, nuevoEstado, auth) => {
  if (!pedido.telefonoCliente || pedido.telefonoCliente === "MOSTRADOR") {
    return;
  }

  let mensaje = "";

  const n = pedido.numero_pedido;

  const esPickup = pedido.entregaMode === "PICKUP";

  if (nuevoEstado === "Confirmado") {
    mensaje =
      `✅ *¡Hola ${pedido.nombreCliente}!* ` +
      `Tu pedido #${n} ha sido confirmado y pronto estará en cocina. 👨‍🍳`;
  } else if (nuevoEstado === "En Camino") {
    mensaje = esPickup
      ? `🛍️ *¡Tu pedido #${n} ya está listo!* Puedes pasar por él.`
      : `🛵 *¡Buenas noticias!* Tu pedido #${n} va en camino.`;
  } else if (nuevoEstado === "Entregado") {
    mensaje =
      `🌟 *¡Pedido entregado!* ` +
      `Gracias por tu compra ${pedido.nombreCliente}`;
  }

  if (mensaje) {
    await sendWhatsAppNotification(pedido.telefonoCliente, mensaje, auth);
  }
};
