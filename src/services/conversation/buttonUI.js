import { sendWhatsAppNotification } from "../notifyService.js";

export const enviarBotonesContinuar = async (userId, bodyText, auth, cart) => {
  const tieneItems = cart && cart.items && cart.items.length > 0;

  const buttons = tieneItems
    ? [
        {
          id: "BTN_CHECKOUT",
          title: "🚀 Ir a Pagar",
        },
        {
          id: "BTN_VER_QUITAR",
          title: "🛒 Ver Carrito",
        },
        {
          id: "MENU",
          title: "📋 Ver Menú",
        },
      ]
    : [
        {
          id: "MENU",
          title: "📋 Ver Menú / Pedir",
        },
      ];

  await sendWhatsAppNotification(
    userId,
    {
      type: "interactive",
      interactive: {
        type: "button",

        body: {
          text: bodyText,
        },

        action: {
          buttons: buttons.map((btn) => ({
            type: "reply",

            reply: {
              id: btn.id,
              title: btn.title,
            },
          })),
        },
      },
    },
    auth,
  );
};

export const enviarListaParaQuitar = async (userId, cart, auth) => {
  if (!cart.items || cart.items.length === 0) {
    return await sendWhatsAppNotification(
      userId,
      "Tu carrito está vacío. 🛒",
      auth,
    );
  }

  const rows = cart.items.map((item, index) => ({
    id: `REMOVE_IDX_${index}`,

    title: `Quitar ${item.nombre}`.substring(0, 24),

    description: `${item.cantidad}x - $${(
      (item.precioUnitario * item.cantidad) /
      100
    ).toFixed(2)}`.substring(0, 72),
  }));

  await sendWhatsAppNotification(
    userId,
    {
      type: "interactive",

      interactive: {
        type: "list",

        header: {
          type: "text",
          text: "Gestionar Carrito",
        },

        body: {
          text: "Selecciona el producto que deseas eliminar de tu pedido:",
        },

        footer: {
          text: "Toca para ver productos",
        },

        action: {
          button: "Ver Productos",

          sections: [
            {
              title: "Tu Pedido Actual",
              rows,
            },
          ],
        },
      },
    },
    auth,
  );
};
