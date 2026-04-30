// src/whatsapp/orderProcessor.js
import Pedido from '../models/Pedido.js';
import ShoppingCart from '../models/ShoppingCart.js';
import { sendMessage, formatPrice } from './utils.js';
import logger from '../utils/logger.js';

export const processFinalOrder = async (userId, cart, businessId, auth, financieros) => {
    try {
        const { items, tempData } = cart;

        // 1. LIMPIEZA DE DATOS (Nivel Square)
        const nombreCliente = (tempData.name && tempData.name !== 'null' && tempData.name !== 'undefined') 
            ? tempData.name 
            : 'Cliente WhatsApp';

        /**
         * CORRECCIÓN DE KEY MAPPING:
         * La IA genera 'notasPago' y 'notasCocina'. 
         * Aseguramos que se capturen correctamente desde tempData.
         */
        const notasPago = tempData.notasPago || "";
        const notasGlobalesCocina = tempData.notasCocina || "";
        const orderNotesExtra = tempData.orderNotes || "";

        // Consolidamos comentarios para la base de datos (Logística y Pago)
        const comentariosFinales = [notasPago, orderNotesExtra].filter(Boolean).join(" - ");

        const esPickup = financieros.esPickup;
        const totalFinal = financieros.total;
        const subtotalFinal = financieros.subtotal;
        const envioFinal = financieros.envio;

        // 2. CREAR PEDIDO VINCULADO AL RESTAURANTE
        const nuevoPedido = new Pedido({
            businessId: businessId,
            telefonoCliente: userId,
            clienteId: userId, 
            nombreCliente: nombreCliente,
            direccionEntrega: esPickup ? 'RECOGIDA EN TIENDA' : (tempData.address || 'No especificada'),
            
            // Guardamos la info de pago/logística aquí
            comentarios: comentariosFinales, 
            
            items: items.map(item => ({
                itemId: item.itemId,
                nombre: item.nombre,
                precioUnitario: item.precioUnitario,
                cantidad: item.quantity || item.cantidad || 1,
                opcionesSeleccionadas: item.opcionesSeleccionadas || [],
                // Priorizamos 'notas' que viene del Validator ya procesado
                notas: item.notas || item.notes || "" 
            })),
            
            subtotal: subtotalFinal,
            costoEnvio: envioFinal, 
            total: totalFinal,
            metodoPago: tempData.paymentMethod || 'Efectivo',
            entregaMode: esPickup ? 'PICKUP' : 'DELIVERY',
            estado: 'Pendiente', 
        });
        
        await nuevoPedido.save();
        
        // 3. LIMPIEZA DEL CARRITO
        await ShoppingCart.deleteOne({ clientPhone: userId, businessId: businessId }); 

        // 4. MENSAJE DE ÉXITO DINÁMICO
        const idPedido = nuevoPedido.numero_pedido || nuevoPedido._id.toString().slice(-6).toUpperCase();
        
        let confirmText = esPickup 
            ? `✅ *¡PEDIDO RECIBIDO! (#${idPedido})*\n\n`
            : `✅ *¡PEDIDO REGISTRADO! (#${idPedido})*\n\n`;

        confirmText += `Gracias *${nombreCliente}*, estamos preparando tu orden.\n`;
        confirmText += `\n*Detalles:*`;
        confirmText += `\n💰 Total: ${formatPrice(totalFinal)}`;
        confirmText += `\n📍 ${esPickup ? '*Retiro en Sucursal*' : '*Dirección:* ' + nuevoPedido.direccionEntrega}`;
        confirmText += `\n💳 Pago: ${nuevoPedido.metodoPago}`;

        // Mostrar notas al cliente (Combinamos notas globales de cocina y pago para el ticket)
        const notasParaTicket = [notasGlobalesCocina, notasPago].filter(Boolean).join(" | ");
        if (notasParaTicket) {
            confirmText += `\n📝 *Notas:* ${notasParaTicket}`;
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