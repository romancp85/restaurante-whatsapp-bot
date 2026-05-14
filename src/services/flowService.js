// src/services/flowService.js
import { getUltimoPedido, generarPropuestaVIP } from './loyaltyService.js';
import { sendMenu } from '../whatsapp/utils.js';
import { sendWhatsAppNotification } from './notifyService.js';
import { updateCart } from '../whatsapp/cartUtils.js';

const SALUDOS = ['HOLA', 'OLA', 'GOLA', 'BUENAS', 'BUENOS', 'DIAS', 'TARDES', 'NOCHES', 'INFO', 'ESTAN', 'VENDIENDO', 'MENU', 'MENÚ'];
const CORTESIA = ['GRACIAS', 'OK', 'DALE', 'ESTA BIEN', 'ENTENDIDO', 'PERFECTO', 'LISTO', '👍', 'BYE', 'ADIOS'];

export const handleInitialFlow = async (userId, businessId, text, cart, auth) => {
    const normalizedText = text.toUpperCase();
    const history = cart.tempData.history || [];

    // 💰 1. FILTRO DE AHORRO (Mensajes de cortesía)
    if (CORTESIA.includes(normalizedText)) {
        console.log(`[flowService] 💸 Ahorrando IA: Mensaje de cortesía detectado.`);
        await sendWhatsAppNotification(userId, "¡Con gusto! Quedo pendiente de tu pedido. 😊", auth);
        return true; // Flujo manejado
    }

    // 🤝 2. PORTERO DE BIENVENIDA (VIP / MENÚ)
    const esSaludo = SALUDOS.some(s => normalizedText.includes(s));
    const esMensajeCorto = text.length < 10;
    const esInicioSesion = cart.items.length === 0 && history.length === 0;

    if (esInicioSesion && (esMensajeCorto || esSaludo)) {
        console.log(`[flowService] 👋 Manejando inicio de conversación.`);
        
        const ultimo = await getUltimoPedido(userId, businessId);
        const propuesta = generarPropuestaVIP(ultimo);

        if (propuesta && cart.conversationState !== 'PROPUESTA_VIP') {
            await updateCart(userId, businessId, { conversationState: 'PROPUESTA_VIP' });
            await sendWhatsAppNotification(userId, {
                type: "interactive",
                interactive: {
                    type: "button",
                    body: { text: propuesta.texto },
                    action: {
                        buttons: [
                            { type: "reply", reply: { id: "REPETIR_PEDIDO", title: "✅ Sí, lo mismo" } },
                            { type: "reply", reply: { id: "MENU_NUEVO", title: "📋 Ver Menú" } }
                        ]
                    }
                }
            }, auth);
            return true;
        }

        // Si no hay VIP, mandamos menú
        await sendMenu(userId, businessId, auth, cart);
        return true;
    }

    return false; // No es un flujo inicial, debe pasar a la IA
};