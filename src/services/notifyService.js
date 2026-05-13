// src/services/notifyService.js
import { sendMessage } from '../whatsapp/utils.js';

export const sendWhatsAppNotification = async (userId, payload, auth) => {
    try {
        await sendMessage(userId, payload, auth);
        console.log(`✅ [notifyService] WhatsApp enviado a ${userId}`);
    } catch (error) {
        console.error(`❌ [notifyService] Error WhatsApp:`, error.message);
    }
};

export const notifyDashboard = (businessId, pedido) => {
    // 🌟 USAMOS global.io PARA ROMPER EL CÍRCULO VICIOSO
    if (!global.io) {
        console.error("⚠️ [notifyService] Socket.io no detectado en el espacio global.");
        return;
    }
    try {
        const salaId = businessId.toString();
        const dataFinal = JSON.parse(JSON.stringify(pedido));
        global.io.to(salaId).emit('NUEVO_PEDIDO', dataFinal);
        console.log(`📢 [notifyService] Dashboard notificado en sala: ${salaId}`);
    } catch (error) {
        console.error(`❌ [notifyService] Error Socket:`, error.message);
    }
};