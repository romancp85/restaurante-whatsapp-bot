import { sendWhatsAppNotification } from "../notifyService.js";

import { updateCart, getOrCreateCart } from "../../whatsapp/cartUtils.js";

import { ejecutarCheckoutInteligente } from "./checkoutFlow.js";

import { calcularDistanciaKM } from "../../utils/geoUtils.js";

export const handleLocationMessage = async ({
  userId,
  businessId,
  auth,
  cart,
  restaurante,
  messageObject,
}) => {
  const { latitude, longitude } = messageObject.location;

  const [restLat, restLon] = restaurante.configuracion.ubicacionLocal
    ?.split(",")
    .map(Number) || [0, 0];

  const distancia = calcularDistanciaKM(latitude, longitude, restLat, restLon);

  const mapsLink = `https://www.google.com/maps?q=${latitude},${longitude}`;

  if (distancia > 5) {
    await sendWhatsAppNotification(
      userId,
      `📍 Estás a ${distancia.toFixed(1)}km. Solo entregamos a 5km. He marcado para *Recoger en Tienda* 🛍️`,
      auth,
    );

    await updateCart(userId, businessId, {
      tempData: {
        ...cart.tempData,
        deliveryMode: "PICKUP",
        address: "GPS: " + mapsLink,
      },
    });
  } else {
    await sendWhatsAppNotification(
      userId,
      "📍 Ubicación guardada con éxito. 🛵",
      auth,
    );

    await updateCart(userId, businessId, {
      tempData: {
        ...cart.tempData,
        deliveryMode: "DELIVERY",
        address: mapsLink,
      },
    });
  }

  const updatedCart = await getOrCreateCart(userId, businessId);

  return await ejecutarCheckoutInteligente(
    userId,
    businessId,
    updatedCart,
    auth,
    restaurante,
  );
};
