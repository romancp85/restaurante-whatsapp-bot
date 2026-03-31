// src/services/aiService.js - VERSIÓN UNIFICADA Y SEGURA

import OpenAI from 'openai';
import MenuItem from '../models/MenuItem.js'; // Asegúrate que la ruta sea correcta
import logger from '../utils/logger.js';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function analizarPedidoConIA(textoPedido) {
    try {
        // 1. Obtener menú real (usando tu servicio actual)
        const menuItems = await MenuItem.find({ activo: true }).lean(); 
        const menuList = menuItems.map(item => `- PRODUCTO: "${item.nombre}" | USAR_ESTE_ID: ${item._id}`).join('\n');

        const systemPrompt = `Eres el extractor de pedidos del restaurante.
        REGLAS:
        - Usa SOLO el ID de 24 caracteres de la lista.
        - PROHIBIDO usar números como "1", "2".
        - Si no hay coincidencia exacta, elige la opción más lógica.
        
        MENÚ:
        ${menuList}`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini", // <--- CAMBIADO A 4O-MINI
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Extrae los items de este pedido en JSON: "${textoPedido}"` }
            ],
            response_format: { type: "json_object" },
            temperature: 0,
        });

        const res = JSON.parse(response.choices[0].message.content);
        let items = Array.isArray(res.items) ? res.items : [];

        // 🛡️ FILTRO ANTI-ERROR "1"
        return items.filter(item => /^[0-9a-fA-F]{24}$/.test(item.itemId));

    } catch (error) {
        logger.error('Error en aiService:', error.message);
        return [];
    }
}