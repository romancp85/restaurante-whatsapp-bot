import MenuItem from "../../models/MenuItem.js";

import { getIntention } from "../aiService.js";
import { applyInference } from "../businessRules.js";
import { processCartActions } from "../cartService.js";

import { sendWhatsAppNotification } from "../notifyService.js";

import { updateCart } from "../../whatsapp/cartUtils.js";

import { buildSemanticMenuMap } from "../../domains/semantic/builders/buildSemanticMenuMap.js";

import { processSemanticMessage } from "../../domains/semanticEngine.js";

import { handleConversationState } from "./handleConversationState.js";

import { enviarBotonesContinuar } from "./buttonUI.js";

export const handleTextMessage = async ({
  userId,
  businessId,
  auth,
  cart,
  restaurante,
  restauranteConfig,
  messageObject,
}) => {
  const text = (messageObject.text?.body || "").trim();

  // =====================================================
  // CONVERSATION STATE ROUTER
  // =====================================================

  const stateHandled = await handleConversationState({
    cart,
    text,
    userId,
    businessId,
    auth,
    restaurante,
  });

  if (stateHandled) {
    return;
  }

  // =====================================================
  // MENU MAP
  // =====================================================

  let menuMap = cart.tempData?.menuMap || [];

  if (!Array.isArray(menuMap) || menuMap.length === 0) {
    const menuItems = await MenuItem.find({
      businessId,
      disponible: true,
    }).lean();

    menuMap = buildSemanticMenuMap(menuItems);

    await updateCart(userId, businessId, {
      tempData: {
        ...cart.tempData,
        menuMap,
      },
    });

    console.log(
      `[Semantic] menuMap cargado desde DB: ${menuMap.length} productos`,
    );
  }

  // =====================================================
  // SEMANTIC ENGINE
  // =====================================================

  let semanticResult;

  try {
    semanticResult = await processSemanticMessage({
      text,
      menuMap,
      cart,
    });
  } catch (err) {
    console.error("[Semantic] Error:", err.message);

    semanticResult = {
      semanticItems: [],
      operations: [],
      references: [],
      contextReference: null,
    };
  }

  const {
    semanticItems = [],
    operations = [],
    references = [],
    contextReference = null,
    ambiguous = null,
  } = semanticResult || {};

  // =====================================================
  // AMBIGUOUS FLOW
  // =====================================================

  if (ambiguous) {
    const rows = ambiguous.candidates.map((candidate, index) => ({
      id: `AMBIGUOUS_${index}`,

      title: candidate.value.substring(0, 24),

      description: `Coincidencia ${(candidate.score * 100).toFixed(0)}%`,
    }));

    await updateCart(userId, businessId, {
      conversationState: "AWAITING_AMBIGUOUS_SELECTION",

      tempData: {
        ...cart.tempData,

        ambiguousCandidates: ambiguous.candidates,
      },
    });

    return await sendWhatsAppNotification(
      userId,
      {
        type: "interactive",

        interactive: {
          type: "list",

          header: {
            type: "text",

            text: "Encontré varias opciones",
          },

          body: {
            text: "¿Cuál producto deseas pedir?",
          },

          footer: {
            text: "Selecciona una opción",
          },

          action: {
            button: "Ver opciones",

            sections: [
              {
                title: "Productos encontrados",

                rows,
              },
            ],
          },
        },
      },

      auth,
    );
  }

  // =====================================================
  // CONTEXT FALLBACK
  // =====================================================

  let finalSemanticItems = [...semanticItems];

  if (finalSemanticItems.length === 0 && contextReference?.productName) {
    finalSemanticItems.push({
      action: "add",

      productName: contextReference.productName,

      quantity: 1,
    });

    console.log("[Semantic] Context fallback aplicado:", finalSemanticItems);
  }

  // =====================================================
  // AI FALLBACK
  // =====================================================

  let aiResponse = {
    items: [],
    extractedData: {},
    waiterMessage: "",
  };

  const shouldUseAI = finalSemanticItems.length === 0;

  if (shouldUseAI) {
    const context = {
      businessId,
      restauranteConfig,
      menuMap,
      cartState: cart.conversationState,

      lastProductDiscussed: cart.tempData.lastProductDiscussed || null,
    };

    try {
      aiResponse = await getIntention(text, context, {
        references,
        operations,
      });
    } catch (err) {
      console.error("[AI] Error getIntention:", err.message);

      aiResponse = {
        items: [],
        extractedData: {},

        waiterMessage: "No pude interpretar tu pedido.",
      };
    }
  }

  // =====================================================
  // SEMANTIC SUCCESS
  // =====================================================
  else {
    aiResponse.waiterMessage = "✅ He agregado los productos a tu pedido";
  }

  // =====================================================
  // BUSINESS RULES
  // =====================================================

  const updatedData = applyInference(
    aiResponse.extractedData || {},
    cart.tempData || {},
  );

  // =====================================================
  // FINAL ITEMS
  // =====================================================

  const finalItems =
    finalSemanticItems.length > 0 ? finalSemanticItems : aiResponse.items || [];

  const { cart: finalCart, alerts } = await processCartActions(
    userId,
    businessId,
    finalItems,
  );

  // =====================================================
  // FINAL MESSAGE
  // =====================================================

  const mensajeFinal =
    (aiResponse.waiterMessage || "Aquí tienes tu pedido 🍔") +
    (alerts ? `\n\n${alerts}` : "");

  // =====================================================
  // HISTORY
  // =====================================================

  const history = Array.isArray(cart.tempData?.history)
    ? cart.tempData.history
    : [];

  await updateCart(userId, businessId, {
    conversationState: "MOSTRANDO_MENU",

    tempData: {
      ...updatedData,

      history: [
        ...history,

        {
          role: "user",
          content: text,
        },

        {
          role: "assistant",
          content: mensajeFinal,
        },
      ].slice(-6),

      lastProductDiscussed:
        finalItems?.[0]?.productName ||
        cart.tempData?.lastProductDiscussed ||
        null,
    },
  });

  // =====================================================
  // FINAL WHATSAPP RESPONSE
  // =====================================================

  return await enviarBotonesContinuar(userId, mensajeFinal, auth, finalCart);
};
