// src/whatsapp/orderProcessor.js

import Pedido from '../models/Pedido.js';
import ShoppingCart from '../models/ShoppingCart.js';
import { sendMessage } from './utils.js';
import { getTransferDetailsMessage } from '../services/paymentService.js';
// 🛑 CAMBIO DE IMPORTACIÓN: Usamos el servicio DB para obtener el costo 🛑
import { getGlobalConfig } from '../services/configServiceDB.js'; 
import logger from '../utils/logger.js';

const FALLBACK_DELIVERY_COST = 3000; // Costo de envío de emergencia en centavos

/**
 * Función auxiliar para obtener el costo de envío del documento global.
 */
const getDeliveryCost = async () => {
    try {
        const config = await getGlobalConfig();
        // Asumiendo que el campo es 'costoEnvioCents'
        const cost = config?.costoEnvioCents; // Usa el signo '?' para protegerte 
        
        if (typeof cost === 'number' && cost >= 0) {
            return cost;
        }
        return FALLBACK_DELIVERY_COST;
    } catch (error) {
        logger.error("Error al obtener costo de envío. Usando fallback.", error);
        return FALLBACK_DELIVERY_COST;
    }
};


/**
 * Procesa la orden final, crea el registro de Pedido, y limpia el carrito.
 * @param {object} cart - El objeto ShoppingCart del cliente.
 */
export const processFinalOrder = async (userId, cart) => { // <--- Añade 'userId' aquí
    // Usamos 'cart' directamente, ya que lo recibimos como segundo argumento
    const { clientPhone, items, tempData } = cart; 
    
    // 🛡️ RED DE SEGURIDAD EXTRA
    if (!items || !Array.isArray(items)) {
        logger.error(`Error: items no es un array para ${clientPhone}`);
        return null;
    }

    if (items.length === 0) {
        await sendMessage(clientPhone, "No puedes finalizar un pedido con el carrito vacío. Escribe *MENÚ* para empezar.");
        return null;
    }
    
    // 1. OBTENER EL VALOR DINÁMICO del COSTO DE ENVÍO
    const costoEnvio = await getDeliveryCost();

    // 2. Calcular Subtotal y Total
    const subtotal = items.reduce((sum, item) => sum + (item.precioUnitario * item.cantidad), 0);
    const total = subtotal + costoEnvio;

    // 3. Crear el registro final del Pedido
    try {
        const metodoPago = tempData.paymentMethod || 'Efectivo';
        
        const nuevoPedido = new Pedido({
            telefonoCliente: clientPhone,
            nombreCliente: tempData.name || 'Cliente de WhatsApp',
            direccionEntrega: tempData.address || 'No especificada',
            items: items,
            subtotal: subtotal,
            costoEnvio: costoEnvio, 
            total: total,
            metodoPago: metodoPago, 
            estado: 'Pendiente', 
        });
        
        await nuevoPedido.save();
        logger.info(`Pedido #${nuevoPedido.numero_pedido} creado para ${clientPhone}.`);

        // 4. Si el pedido se guardó con éxito, limpiamos el carrito
        await ShoppingCart.deleteOne({ clientPhone: clientPhone }); 
        logger.info(`Carrito borrado para ${clientPhone}.`);

        // 5. Enviar confirmación
        let confirmText = `¡Gracias, *${nuevoPedido.nombreCliente}*!\n`;
        confirmText += `\n✅ Tu pedido #${nuevoPedido.numero_pedido} ha sido registrado.\n`;
        confirmText += `\n*Detalles:*\nTotal: $${(total / 100).toFixed(2)}\nMétodo de Pago: ${nuevoPedido.metodoPago}\nDirección: ${nuevoPedido.direccionEntrega}\n`;

        if (nuevoPedido.metodoPago.toLowerCase() === 'transferencia') {
            const transferDetails = await getTransferDetailsMessage(); 
            confirmText += "\n\n*INSTRUCCIONES DE PAGO:*\n";
            confirmText += `${transferDetails}\n`;
            confirmText += "\n⚠️ Por favor, realiza la transferencia antes de la entrega.";
        }
        
        confirmText += "\n\nTe enviaremos una notificación cuando esté en camino. ¡Que lo disfrutes!";
        
        await sendMessage(clientPhone, confirmText);

        return nuevoPedido;

    } catch (error) {
        // MANEJO DE ERROR CRÍTICO
        logger.error(`Error FATAL al procesar el pedido final para ${clientPhone}. El carrito NO fue borrado. Causa:`, error);
        
        await sendMessage(clientPhone, "⚠️ Lo sentimos, hubo un error crítico al finalizar tu pedido y no pudo ser registrado. Por favor, intenta de nuevo o contacta al restaurante.");
        return null;
    }
};