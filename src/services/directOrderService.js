// src/services/directOrderService.js

import Pedido from "../models/Pedido.js";
import MenuItem from "../models/MenuItem.js";

import { notifyDashboard } from "./notifyService.js";

export const processDirectOrder = async (jobData) => {
  const { items, tempData, businessId, costoEnvio } = jobData;

  const itemIds = items.map((i) => i.itemId);

  const productosDB = await MenuItem.find({
    _id: { $in: itemIds },
    businessId,
  }).lean();

  const itemsValidados = items
    .map((i) => {
      const p = productosDB.find(
        (prod) => prod._id.toString() === i.itemId.toString(),
      );

      return p
        ? {
            itemId: p._id,
            nombre: p.nombre,
            precioUnitario: i.precioUnitario,
            cantidad: i.cantidad || 1,
            opcionesSeleccionadas: i.opcionesSeleccionadas || [],
            notas: i.notas || "",
          }
        : null;
    })
    .filter(Boolean);

  const subtotal = itemsValidados.reduce(
    (acc, i) => acc + i.precioUnitario * i.cantidad,
    0,
  );

  const envio = parseInt(costoEnvio) || 0;

  const pedidoDirecto = new Pedido({
    businessId,
    source: "DIRECTO",
    nombreCliente: tempData.name || "Caja",
    telefonoCliente: "MOSTRADOR",
    clienteId: "WALK-IN",
    direccionEntrega: tempData.address || "TIENDA",
    items: itemsValidados,
    subtotal,
    costoEnvio: envio,
    total: subtotal + envio,
    metodoPago: tempData.paymentMethod || "Efectivo",
    entregaMode: "PICKUP",
    estado:
      tempData.paymentMethod?.toUpperCase() === "TRANSFERENCIA"
        ? "Pendiente de Pago"
        : "Confirmado",
  });

  await pedidoDirecto.save();

  await MenuItem.bulkWrite(
    itemsValidados.map((i) => ({
      updateOne: {
        filter: { _id: i.itemId },
        update: {
          $inc: { vendidas_hoy: i.cantidad },
        },
      },
    })),
  );

  notifyDashboard(businessId, pedidoDirecto);

  return pedidoDirecto;
};
