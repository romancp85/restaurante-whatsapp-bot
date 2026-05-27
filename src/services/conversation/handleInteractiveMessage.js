import { sendWhatsAppNotification } from "../notifyService.js";

import { sendMenu, sendCartSummary } from "../../whatsapp/utils.js";

import {
  getOrCreateCart,
  updateCart,
  removeItemsByName,
  addItemToCart,
} from "../../whatsapp/cartUtils.js";

import { processCartActions } from "../cartService.js";

import { ejecutarCheckoutInteligente } from "./checkoutFlow.js";

import { processFinalOrder } from "../../whatsapp/orderProcessor.js";

import { calcularTotalesFinales } from "../orderValidator.js";

import { notifyDashboard } from "../notifyService.js";

import { getUltimoPedido } from "../loyaltyService.js";

import { enviarBotonesContinuar, enviarListaParaQuitar } from "./buttonUI.js";

import CONVERSATION_STATES from "../../constants/conversationStates.js";

export const handleInteractiveMessage = async ({
  userId,
  businessId,
  auth,
  cart: initialCart,
  restaurante,
  messageObject,
}) => {
  let cart = initialCart;

  const actionId =
    messageObject.interactive.button_reply?.id ||
    messageObject.interactive.list_reply?.id;

  if (
    cart.conversationState ===
      CONVERSATION_STATES.AWAITING_AMBIGUOUS_SELECTION &&
    actionId?.startsWith("AMBIGUOUS_")
  ) {
    const index = Number(actionId.split("_")[1]);

    const candidates = cart.tempData?.ambiguousCandidates || [];

    const selected = candidates[index];

    if (!selected) {
      return await sendWhatsAppNotification(
        userId,
        "No pude identificar la selección.",
        auth,
      );
    }

    const finalItems = [
      {
        action: "add",
        productName: selected.value,
        quantity: 1,
        modifiers: [],
        notes: "",
      },
    ];

    const { cart: updatedCart } = await processCartActions(
      userId,
      businessId,
      finalItems,
    );

    await updateCart(userId, businessId, {
      conversationState: CONVERSATION_STATES.MOSTRANDO_MENU,

      tempData: {
        ...cart.tempData,

        ambiguousCandidates: null,

        lastProductDiscussed: selected.value,
      },
    });

    return await enviarBotonesContinuar(
      userId,
      `✅ Agregué *${selected.value}* a tu pedido`,
      auth,
      updatedCart,
    );
  }

  if (actionId === "REPETIR_PEDIDO") {
    const ultimo = await getUltimoPedido(userId, businessId);
    if (ultimo) {
      let itemsFallidos = [];
      for (const item of ultimo.items) {
        const res = await addItemToCart(userId, businessId, {
          itemId: item.itemId,
          quantity: item.cantidad,
          opcionesSeleccionadas: item.opcionesSeleccionadas || [],
          notas: item.notas || "",
        });
        if (!res.success) itemsFallidos.push(item.nombre);
      }
      await updateCart(userId, businessId, {
        conversationState: CONVERSATION_STATES.PROPUESTA_VIP,
        tempData: {
          ...cart.tempData,
          name: ultimo.nombreCliente,
          address: ultimo.direccionEntrega,
          deliveryMode: ultimo.entregaMode,
          paymentMethod: ultimo.metodoPago,
        },
      });
      cart = await getOrCreateCart(userId, businessId);
      const msg =
        itemsFallidos.length > 0
          ? `Pedido cargado parcial (sin stock de: ${itemsFallidos.join(", ")}).`
          : `¡Listo! Pedido anterior cargado.`;
      return await sendWhatsAppNotification(
        userId,
        {
          type: "interactive",
          interactive: {
            type: "button",
            body: { text: `${msg}\n\n¿Confirmamos los datos?` },
            action: {
              buttons: [
                {
                  type: "reply",
                  reply: {
                    id: "VIP_CONFIRMAR_TODO",
                    title: "✅ Todo igual",
                  },
                },
                {
                  type: "reply",
                  reply: {
                    id: "VIP_CAMBIAR_DATOS",
                    title: "✏️ Cambiar algo",
                  },
                },
                {
                  type: "reply",
                  reply: { id: "MENU", title: "📋 Ver Menú" },
                },
              ],
            },
          },
        },
        auth,
      );
    }
  }

  if (actionId === "VIP_CAMBIAR_DATOS") {
    await updateCart(userId, businessId, {
      conversationState: CONVERSATION_STATES.PREGUNTANDO_MODO_ENTREGA,
      tempData: {
        ...cart.tempData,
        deliveryMode: null,
        address: null,
        paymentMethod: null,
      },
    });
    cart = await getOrCreateCart(userId, businessId);
    return await ejecutarCheckoutInteligente(
      userId,
      businessId,
      cart,
      auth,
      restaurante,
    );
  }

  if (actionId === "VIP_CONFIRMAR_TODO" || actionId === "BTN_CHECKOUT")
    return await ejecutarCheckoutInteligente(
      userId,
      businessId,
      cart,
      auth,
      restaurante,
    );

  if (actionId === "BTN_LANZAR_LISTA_QUITAR")
    return await enviarListaParaQuitar(userId, cart, auth);

  if (actionId === "MENU" || actionId === "MENU_NUEVO") {
    await updateCart(userId, businessId, {
      conversationState: CONVERSATION_STATES.MOSTRANDO_MENU,
      tempData: {
        ...cart.tempData,
        deliveryMode: null,
        address: null,
        paymentMethod: null,
      },
    });
    cart = await getOrCreateCart(userId, businessId);
    return await sendMenu(userId, businessId, auth, cart);
  }

  if (actionId === "CARRITO" || actionId === "BTN_VER_QUITAR")
    return await sendCartSummary(userId, cart, businessId, auth);

  if (actionId === "BTN_CONFIRMAR_FINAL") {
    const financieros = calcularTotalesFinales(
      cart.items,
      cart.tempData.deliveryMode,
      restaurante,
    );
    const pedidoFinal = await processFinalOrder(
      userId,
      cart,
      businessId,
      auth,
      financieros,
    );
    if (pedidoFinal) notifyDashboard(businessId, pedidoFinal);
    return;
  }

  if (actionId?.startsWith("REMOVE_IDX_")) {
    const index = parseInt(actionId.split("_")[2]);
    const removedName = cart.items[index]?.nombre;
    await removeItemsByName(userId, businessId, removedName);
    await sendWhatsAppNotification(
      userId,
      `✅ Eliminado: *${removedName}*`,
      auth,
    );
    const updatedCart = await getOrCreateCart(userId, businessId);
    return await enviarBotonesContinuar(
      userId,
      "¿Deseas algo más?",
      auth,
      updatedCart,
    );
  }

  if (actionId?.startsWith("MODE_"))
    cart.tempData.deliveryMode =
      actionId === "MODE_DELIVERY" ? "DELIVERY" : "PICKUP";
  if (actionId?.startsWith("PAYMENT_"))
    cart.tempData.paymentMethod = actionId
      .replace("PAYMENT_", "")
      .replace(/_/g, " ");

  await updateCart(userId, businessId, { tempData: cart.tempData });
  return await ejecutarCheckoutInteligente(
    userId,
    businessId,
    cart,
    auth,
    restaurante,
  );
};
