// src/services/aiService.js
import { analizarPedidoConIA } from '../utils/aiUtils.js';

export const getIntention = async (text, context) => {
    const { history, menuMap, businessId, restauranteConfig, lastProductDiscussed } = context;

    // 1. Traductor de Índices (Lógica técnica separada del Worker)
    let processedText = text;
    if (menuMap?.length > 0) {
        const sortedMap = [...menuMap].sort((a, b) => b.index - a.index);
        sortedMap.forEach(item => {
            const regex = new RegExp(`\\b(la|el|del|n\\.?|#|numero|posicion)?\\s*${item.index}\\b`, 'gi');
            const esSoloNumero = text.trim() === item.index.toString();
            
            if (regex.test(processedText) || esSoloNumero) {
                processedText = esSoloNumero ? item.nombre : processedText.replace(regex, ` ${item.nombre} `);
            }
        });
    }

    console.log(`[aiService] Texto Original: "${text}" | Traducido: "${processedText}"`);

    // 2. Llamada al Motor de IA (Mateo)
    const aiResponse = await analizarPedidoConIA(
        processedText, 
        businessId, 
        history, 
        restauranteConfig, 
        lastProductDiscussed, 
        menuMap
    );

    return aiResponse;
};