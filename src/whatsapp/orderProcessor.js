// src/whatsapp/orderProcessor.js
import Pedido from '../models/Pedido.js';
import ShoppingCart from '../models/ShoppingCart.js';
import Restaurante from '../models/Restaurante.js'; 
import MenuItem from '../models/MenuItem.js'; // 👈 FALTA ESTA IMPORTACIÓN
import { sendMessage, formatPrice } from './utils.js';
import logger from '../utils/logger.js';

export const processFinalOrder = async (userId, cart, businessId, auth, financieros) => {
    try {
        const { items, tempData } = cart;

        // 1. OBTENER CONFIGURACIÓN DEL RESTAURANTE
        const restaurante = await Restaurante.findById(businessId).lean();

        // 2. LIMPIEZA Y NORMALIZACIÓN DE DATOS
        const nombreCliente = (tempData.name && tempData.name !== 'null' && tempData.name !== 'undefined') 
            ? tempData.name 
            : 'Cliente WhatsApp';

        const notasPago = tempData.notasPago || "";
        const notasGlobalesCocina = tempData.notasCocina || "";
        const orderNotesExtra = tempData.orderNotes || "";

        const comentariosFinales = [notasPago, orderNotesExtra].filter(Boolean).join(" - ");

        const esPickup = financieros.esPickup;
        const totalFinal = financieros.total;
        const subtotalFinal = financieros.subtotal;
        const envioFinal = financieros.envio;

        // 3. CREAR EL PEDIDO INMUTABLE EN LA DB
        const nuevoPedido = new Pedido({
            businessId: businessId,
            telefonoCliente: userId,
            clienteId: userId, 
            nombreCliente: nombreCliente,
            direccionEntrega: esPickup ? 'RECOGIDA EN TIENDA' : (tempData.address || 'No especificada'),
            comentarios: comentariosFinales, 
            items: items.map(item => ({
                itemId: item.itemId,
                nombre: item.nombre,
                precioUnitario: item.precioUnitario,
                cantidad: item.cantidad || 1,
                opcionesSeleccionadas: item.opcionesSeleccionadas || [],
                notas: item.notas || "" 
            })),
            subtotal: subtotalFinal,
            costoEnvio: envioFinal, 
            total: totalFinal,
            metodoPago: tempData.paymentMethod || 'Efectivo',
            entregaMode: esPickup ? 'PICKUP' : 'DELIVERY',
            estado: 'Pendiente', 
        });
        
        await nuevoPedido.save();

        // 🌟 ACTUALIZACIÓN DE STOCK (VENDIDAS HOY)
        try {
            const bulkOps = nuevoPedido.items.map(item => ({
                updateOne: {
                    filter: { _id: item.itemId },
                    update: { $inc: { vendidas_hoy: item.cantidad } }
                }
            }));
            
            if (bulkOps.length > 0) {
                await MenuItem.bulkWrite(bulkOps);
                logger.info(`[Stock] Inventario actualizado para pedido #${nuevoPedido.numero_pedido}`);
            }
        } catch (stockError) {
            logger.error(`Error al actualizar stock del pedido ${nuevoPedido.numero_pedido}:`, stockError);
            // No bloqueamos el pedido si falla el stock, solo lo logueamos
        }

        // 🌟 BORRADO TOTAL DE LA SESIÓN
        await ShoppingCart.deleteOne({ whatsappId: userId, businessId: businessId }); 
        logger.info(`[SaaS] Sesión limpiada con éxito para ${userId}`);

        // 4. CONSTRUCCIÓN DEL MENSAJE DE ÉXITO
        const idPedido = nuevoPedido.numero_pedido || nuevoPedido._id.toString().slice(-6).toUpperCase();
        
        let confirmText = esPickup 
            ? `✅ *¡PEDIDO RECIBIDO! (#${idPedido})*\n\n`
            : `✅ *¡PEDIDO REGISTRADO! (#${idPedido})*\n\n`;

        confirmText += `Gracias *${nombreCliente}*, estamos preparando tu orden.\n`;
        confirmText += `\n*Detalles:*`;
        confirmText += `\n💰 Total: ${formatPrice(totalFinal)}`;
        confirmText += `\n📍 ${esPickup ? '*Retiro en Sucursal*' : '*Dirección:* ' + nuevoPedido.direccionEntrega}`;
        confirmText += `\n💳 Pago: ${nuevoPedido.metodoPago}`;

        const notasParaTicket = [notasGlobalesCocina, notasPago].filter(Boolean).join(" | ");
        if (notasParaTicket) {
            confirmText += `\n📝 *Notas:* ${notasParaTicket}`;
        }

        // LÓGICA DE TRANSFERENCIA
        if (nuevoPedido.metodoPago.toUpperCase() === 'TRANSFERENCIA') {
            const infoBanco = restaurante.configuracion?.datosTransferencia;
            if (infoBanco) {
                confirmText += `\n\n━━━━━━━━━━━━━━\n${infoBanco}\n━━━━━━━━━━━━━━`;
            }
        }

        confirmText += esPickup 
            ? "\n\nTe avisaremos cuando esté listo para retirar. 🛍️"
            : "\n\nTe avisaremos cuando el repartidor vaya en camino. 🛵";
        
        await sendMessage(userId, confirmText, auth);

        return nuevoPedido;

    } catch (error) {
        logger.error(`Error FATAL en processFinalOrder:`, error);
        await sendMessage(userId, "⚠️ Hubo un error al registrar tu pedido. Por favor, contacta al restaurante.", auth);
        return null;
    }
};