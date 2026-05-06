// src/controllers/order.controller.js
import Pedido from '../models/Pedido.js';
import Restaurante from '../models/Restaurante.js';
import { sendMessage } from '../whatsapp/utils.js';
import { decrypt } from '../utils/cryptoUtils.js';
import logger from '../utils/logger.js';

/**
 * @desc Obtener pedidos activos de UN restaurante específico
 */
export const getActiveOrders = async (req, res) => {
    try {
        const { businessId } = req.query; // El ID del restaurante logueado
        const activeStatuses = ['Pendiente', 'Confirmado', 'En Preparación', 'En Camino'];
        
        const pedidos = await Pedido.find({ 
            businessId,
            estado: { $in: activeStatuses }
        }).sort({ createdAt: -1 }); // El más reciente arriba

        res.status(200).json(pedidos);
    } catch (error) {
        res.status(500).json({ message: 'Error al obtener pedidos.' });
    }
};

/**
 * @desc Actualizar estado y NOTIFICAR por WhatsApp
 */
export const updateOrderStatus = async (req, res) => {
    const { id } = req.params;
    const { nuevoEstado } = req.body;

    try {
        const pedido = await Pedido.findById(id);
        if (!pedido) return res.status(404).json({ message: 'Pedido no encontrado.' });

        pedido.estado = nuevoEstado;
        await pedido.save();

        // 🚀 LÓGICA DE NOTIFICACIÓN AUTOMÁTICA
        const restaurante = await Restaurante.findById(pedido.businessId);
        const tokenReal = decrypt(restaurante.whatsappToken);
        const auth = { token: tokenReal, phoneId: restaurante.whatsappPhoneId };

        let mensajeWhatsApp = "";
        switch (nuevoEstado) {
            case 'Confirmado':
                mensajeWhatsApp = `✅ *¡Buenas noticias, ${pedido.nombreCliente}!* Tu pedido #${pedido.numero_pedido} ha sido confirmado y ya entró a cocina. 👨‍🍳`;
                break;
            case 'En Camino':
                mensajeWhatsApp = `🛵 *¡Tu pedido #${pedido.numero_pedido} va en camino!* El repartidor llegará pronto a tu ubicación.`;
                break;
            case 'Entregado':
                mensajeWhatsApp = `🌟 *¡Pedido entregado!* Que disfrutes tu comida. Si te gustó nuestro servicio, ¡recomiéndanos! 😋`;
                break;
        }

        if (mensajeWhatsApp) {
            await sendMessage(pedido.telefonoCliente, mensajeWhatsApp, auth);
        }

        res.status(200).json({ message: `Estado actualizado a ${nuevoEstado}`, pedido });

    } catch (error) {
        logger.error(`Error al actualizar pedido ${id}:`, error);
        res.status(400).json({ message: 'Error al actualizar el estado.' });
    }
};