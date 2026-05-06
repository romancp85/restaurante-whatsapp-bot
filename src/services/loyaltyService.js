import Pedido from '../models/Pedido.js';

export const getUltimoPedido = async (userId, businessId) => {
    return await Pedido.findOne({ telefonoCliente: userId, businessId })
                       .sort({ createdAt: -1 })
                       .lean();
};

export const generarPropuestaVIP = (ultimoPedido) => {
    if (!ultimoPedido) return null;
    
    const resumen = ultimoPedido.items.map(i => `${i.cantidad}x ${i.nombre}`).join(', ');
    return {
        texto: `¡Hola de nuevo! 👋 ¿Gustas pedir lo mismo de la última vez? \n\n🍕 *${resumen}*\n📍 Envío a: ${ultimoPedido.direccionEntrega}`,
        items: ultimoPedido.items,
        direccion: ultimoPedido.direccionEntrega,
        metodoPago: ultimoPedido.metodoPago,
        modoEntrega: ultimoPedido.entregaMode
    };
};