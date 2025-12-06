// src/services/aiService.js - CÓDIGO CORREGIDO Y CON PROMPT MEJORADO

import OpenAI from 'openai';
import { getMenu } from './menuService.js';
import logger from '../utils/logger.js';
import mongoose from 'mongoose'; // Necesaria para usar Types.ObjectId

// Asegúrate de definir esta variable en tu archivo .env
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Inicialización del cliente de OpenAI
const openai = new OpenAI({
    apiKey: OPENAI_API_KEY,
});

/**
 * Analiza un mensaje de texto libre y extrae los ítems del menú solicitados.
 */
export async function analizarPedidoConIA(textoPedido) {
    if (!OPENAI_API_KEY) {
        logger.warn('Clave de OpenAI no configurada. Saltando análisis de IA.');
        return [];
    }

    try {
        const menu = await getMenu();
        
        // 🛑 MEJORA DEL CONTEXTO: Añadir más campos para que la IA haga mejores coincidencias
        const catalogo = menu.map(p => ({
            _id: p._id.toString(), 
            nombre: p.nombre,
            categoria: p.categoria,
            palabras_clave: p.nombre.toLowerCase().split(' ').join(', ')
        }));

        const prompt = `
        Eres un extractor de pedidos para un restaurante. Analiza el siguiente PEDIDO_DEL_CLIENTE y extrae la cantidad (qty) y el ID (itemId) de los ítems en el CATÁLOGO.

        - Solo incluye ítems que coincidan con el catálogo.
        - Si el cliente no especifica la cantidad, asume 'cantidad': 1.
        - El valor de 'itemId' debe ser el string del _id del catálogo.
        - El valor de 'cantidad' debe ser un número entero.

        CATÁLOGO: ${JSON.stringify(catalogo)}

        PEDIDO_DEL_CLIENTE: "${textoPedido}"
        `;

        const response = await openai.chat.completions.create({
            model: "gpt-3.5-turbo-0125",
            messages: [
                { role: "system", content: "Siempre responde ÚNICAMENTE con un objeto JSON en el formato {'items': [{'itemId': 'ID_PRODUCTO', 'cantidad': 1}, ...]}. No agregues comentarios ni texto adicional." },
                { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" }, 
            temperature: 0, 
        });

        const jsonText = response.choices[0].message.content;
        const resultado = JSON.parse(jsonText);
        
        return Array.isArray(resultado.items) ? resultado.items : [];

    } catch (error) {
        logger.error('Error al analizar pedido con IA o parsear JSON:', error.message);
        return []; 
    }
}