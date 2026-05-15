// src/controllers/order.controller.js
import Pedido from '../models/Pedido.js';
import Restaurante from '../models/Restaurante.js';
import { sendMessage } from '../whatsapp/utils.js';
import { decrypt } from '../utils/cryptoUtils.js';
import { enqueueOrder } from '../queues/orderQueue.js'; // 👈 ESTA ERA LA IMPORTACIÓN QUE FALTABA
import { notifyOrderStatusUpdate } from '../services/notifyService.js';         
import logger from '../utils/logger.js';

/**
 * @desc Obtener pedidos activos (Protegido por Token)
 */
export const getActiveOrders = async (req, res) => {
    try {
        // 🛡️ REGLA SaaS: El businessId viene del middleware verificarToken
        const businessId = req.businessId; 

        const activeStatuses = ['Pendiente', 'Pendiente de Pago', 'Confirmado', 'En Preparación', 'En Camino'];
        
        const pedidos = await Pedido.find({ 
            businessId: businessId, // Solo traemos los pedidos DE ESTE restaurante
            estado: { $in: activeStatuses }
        }).sort({ createdAt: -1 });

        res.status(200).json(pedidos);
    } catch (error) {
        logger.error('Error al obtener pedidos:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};


/**
 * @desc Actualizar estado (Protegido por Token)
 */
export const updateOrderStatus = async (req, res) => {
    const { id } = req.params;
    const { nuevoEstado } = req.body;

    try {
        const pedido = await Pedido.findById(id);

        if (!pedido || pedido.businessId.toString() !== req.businessId.toString()) {
            return res.status(404).json({ message: 'Pedido no autorizado.' });
        }

        // 1. Actualizar en Base de Datos
        pedido.estado = nuevoEstado;
        await pedido.save();

        // 2. Obtener credenciales del restaurante para notificar
        const restaurante = await Restaurante.findById(pedido.businessId).lean();
        const auth = { 
            token: decrypt(restaurante.whatsappToken), 
            phoneId: restaurante.whatsappPhoneId 
        };

        // 3. 🚀 DELEGAR NOTIFICACIÓN (La única fuente de verdad)
        // Ya no escribimos mensajes aquí, el servicio sabe qué decir.
        await notifyOrderStatusUpdate(pedido, nuevoEstado, auth);

        res.status(200).json({ message: "Estado actualizado y cliente notificado", pedido });
    } catch (error) {
        logger.error('Error al actualizar pedido:', error);
        res.status(400).json({ message: 'Error al procesar el cambio.' });
    }
};

/**
 * @desc Crear pedido directo (Protegido por Token)
 */
export const createDirectOrder = async (req, res) => {
    try {
        const { items, customerName, customerPhone, metodoPago, deliveryMode, direccionEntrega } = req.body;

        if (!items || items.length === 0) return res.status(400).json({ message: "Pedido vacío" });

        await enqueueOrder('DIRECTO', {
            businessId: req.businessId,
            items,
            tempData: { 
                name: customerName, 
                phone: customerPhone,
                paymentMethod: metodoPago, 
                deliveryMode: deliveryMode,
                address: direccionEntrega
            }
        });

        res.status(202).json({ message: "Pedido en cola" });
    } catch (error) {
        res.status(500).json({ message: "Error interno" });
    }
};