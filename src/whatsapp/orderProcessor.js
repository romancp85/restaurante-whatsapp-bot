// src/whatsapp/orderProcessor.js
import Pedido from "../models/Pedido.js";
import ShoppingCart from "../models/ShoppingCart.js";
import Restaurante from "../models/Restaurante.js";
import MenuItem from "../models/MenuItem.js";
import { sendMessage, formatPrice } from "./utils.js";
import { sendWhatsAppNotification } from "../services/notifyService.js";
import logger from "../utils/logger.js";

export const processFinalOrder = async (
  userId,
  cart,
  businessId,
  auth,
  financieros,
) => {
  try {
    const { items, tempData } = cart;
    const restaurante = await Restaurante.findById(businessId).lean();

    // 1. NORMALIZACIÓN DE IDENTIDAD
    const nombreCliente =
      tempData.name && tempData.name !== "null"
        ? tempData.name
        : "Cliente WhatsApp";
    const metodoPago = (tempData.paymentMethod || "Efectivo").toUpperCase();
    const esTransferencia = metodoPago === "TRANSFERENCIA";

    // 2. CREAR EL PEDIDO (Estado inicial depende del pago)
    const nuevoPedido = new Pedido({
      businessId: businessId,
      telefonoCliente: userId,
      clienteId: userId,
      nombreCliente: nombreCliente,
      direccionEntrega: financieros.esPickup
        ? "ENTREGA EN TIENDA"
        : tempData.address || "No especificada",
      comentarios: [tempData.notasPago, tempData.orderNotes]
        .filter(Boolean)
        .join(" - "),
      items: items.map((item) => ({
        itemId: item.itemId,
        nombre: item.nombre,
        precioUnitario: item.precioUnitario,
        cantidad: item.cantidad || 1,
        opcionesSeleccionadas: item.opcionesSeleccionadas || [],
        notas: item.notas || "",
      })),
      subtotal: financieros.subtotal,
      costoEnvio: financieros.envio,
      total: financieros.total,
      metodoPago: tempData.paymentMethod || "Efectivo",
      entregaMode: financieros.esPickup ? "PICKUP" : "DELIVERY",
      // 💰 Si es transferencia, entra como "Pendiente de Pago"
      estado: esTransferencia ? "Pendiente de Pago" : "Pendiente",
    });

    await nuevoPedido.save();

    // 3. ACTUALIZACIÓN ATÓMICA DE STOCK
    try {
      const bulkOps = nuevoPedido.items.map((item) => ({
        updateOne: {
          filter: { _id: item.itemId },
          update: { $inc: { vendidas_hoy: item.cantidad } },
        },
      }));
      if (bulkOps.length > 0) await MenuItem.bulkWrite(bulkOps);
    } catch (stockError) {
      logger.error(
        `[Stock Error] Pedido #${nuevoPedido.numero_pedido}: ${stockError.message}`,
      );
    }

    // 4. 🌟 SOFT RESET (MEMORIA POST-VENTA)
    // En lugar de borrar, limpiamos lo operativo pero mantenemos la conversación
    await ShoppingCart.updateOne(
      { whatsappId: userId, businessId: businessId },
      {
        $set: {
          items: [], // 🗑️ Vaciamos la bolsa física
          totalCents: 0, // 💰 Reseteamos el dinero
          conversationState: esTransferencia
            ? "ESPERANDO_COMPROBANTE"
            : "POST_VENTA",
          tempData: {
            ...tempData,
            history: tempData.history.slice(-4), // Mantenemos solo un poco de memoria
            lastProductDiscussed: null, // 👈 VITAL: Borrar el ancla
            deliveryMode: null,
            address: null,
            paymentMethod: null,
          },
        },
      },
    );
    logger.info(`[SaaS] Sesión evolucionada a POST_VENTA para ${userId}`);
    //logger.info(`[SaaS] Sesión evolucionada a ${esTransferencia ? 'ESPERANDO_COMPROBANTE' : 'POST_VENTA'} para ${userId}`);

    // 5. CONSTRUCCIÓN DEL MENSAJE (Luxury Experience)
    const idPedido = nuevoPedido.numero_pedido;
    let confirmText = `✅ *¡PEDIDO REGISTRADO! (#${idPedido})*\n\n`;
    confirmText += `Gracias *${nombreCliente}*, hemos recibido tu solicitud.\n`;
    confirmText += `\n💰 *Total:* ${formatPrice(financieros.total)}`;
    confirmText += `\n💳 *Pago:* ${nuevoPedido.metodoPago}`;
    confirmText += `\n📍 *Entrega:* ${nuevoPedido.direccionEntrega}\n`;

    if (esTransferencia) {
      const infoBanco =
        restaurante.configuracion?.datosTransferencia ||
        "Consultar datos con el establecimiento.";
      confirmText += `\n━━━━━━━━━━━━━━\n*POR FAVOR ENVÍA TU COMPROBANTE:* \n${infoBanco}\n━━━━━━━━━━━━━━\n`;
      confirmText += `\n_Una vez que envíes la foto del comprobante, validaremos tu pago para meter tu orden a cocina._ 📸`;
    } else {
      confirmText += financieros.esPickup
        ? "\nTe avisaremos por aquí cuando tu pedido esté listo para retirar. 🛍️"
        : "\nTe avisaremos por aquí cuando el repartidor vaya en camino. 🛵";
    }

    await sendMessage(userId, confirmText, auth);
    return nuevoPedido;
  } catch (error) {
    logger.error(`Error FATAL en processFinalOrder:`, error);
    await sendMessage(
      userId,
      "⚠️ Hubo un error al registrar tu pedido. Por favor, contacta al restaurante.",
      auth,
    );
    return null;
  }
};
