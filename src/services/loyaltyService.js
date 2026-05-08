// src/services/loyaltyService.js
import Pedido from '../models/Pedido.js';

export const getUltimoPedido = async (userId, businessId) => {
    try {
        return await Pedido.findOne({ 
            $or: [{ telefonoCliente: userId }, { clienteId: userId }], 
            businessId 
        })
        .sort({ createdAt: -1 })
        .lean();
    } catch (error) {
        return null;
    }
};

export const generarPropuestaVIP = (ultimoPedido) => {
    // 1. Validaciones de seguridad
    if (!ultimoPedido || !ultimoPedido.items || ultimoPedido.items.length === 0) return null;
    
    const unMesEnMs = 30 * 24 * 60 * 60 * 1000;
    if ((new Date() - ultimoPedido.createdAt) > unMesEnMs) return null;

    // 2. Construir resumen de productos
    const resumen = ultimoPedido.items
        .map(i => `${i.cantidad}x ${i.nombre}`)
        .join(', ');

    // 3. Formatear lugar de entrega
    let lugar = "Recoger en tienda 🛍️";
    if (ultimoPedido.entregaMode === 'DELIVERY') {
        // Si es un link de Maps, lo acortamos para que se vea bonito
        lugar = (ultimoPedido.direccionEntrega && ultimoPedido.direccionEntrega.includes('google.com')) 
            ? "Tu ubicación guardada 📍" 
            : (ultimoPedido.direccionEntrega || "A domicilio 🛵");
    }

    return {
        texto: `¡Hola de nuevo! 👋 ¿Gustas pedir lo mismo de la última vez?\n\n🍕 *${resumen}*\n📍 *Envío a:* ${lugar}`,
        datos: {
            items: ultimoPedido.items,
            name: ultimoPedido.nombreCliente,
            address: ultimoPedido.direccionEntrega,
            deliveryMode: ultimoPedido.entregaMode,
            paymentMethod: ultimoPedido.metodoPago
        }
    };
};