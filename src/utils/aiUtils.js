// src/utils/aiUtils.js - INTEGRACIÓN FINAL CON OPENAI

import logger from './logger.js';
import MenuItem from '../models/MenuItem.js';
import OpenAI from 'openai'; 
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Esquema JSON CRÍTICO que el modelo debe devolver.
 */
const JSON_SCHEMA_OBJECT = {
    items: {
        type: "array",
        description: "Lista de productos identificados en el pedido.",
        items: {
            type: "object",
            properties: {
                itemId: { type: "string", description: "ID de MongoDB del producto coincidente." }, 
                quantity: { type: "integer", description: "Cantidad del ítem, debe ser 1 si no se especifica." },
                notes: { type: "string", description: "Cualquier nota adicional (ej: sin cebolla, extra queso)." }
            },
            required: ["itemId", "quantity"]
        }
    },
    clienteInfo: {
        type: "object",
        description: "Información de contacto y envío.",
        properties: {
            // Campos críticos para el salto rápido:
            nombre: { type: "string", description: "Nombre completo del cliente. Debe buscar 'a nombre de', 'mi nombre es', etc." },
            direccion: { type: "string", description: "Dirección de entrega completa. Debe buscar patrones de dirección." },
            metodoPago: { type: "string", description: "Método de pago (Efectivo, Transferencia, Tarjeta). Usa el valor identificado o 'Efectivo' si no se especifica." }
        },
        required: ["nombre", "direccion", "metodoPago"]
    }
};


/**
 * @desc Analiza texto libre usando OpenAI para devolver un objeto JSON estructurado.
 * @param {string} text - El texto libre del cliente.
 * @returns {Promise<Object>} Objeto con items y clienteInfo.
 */
export const analizarPedidoConIA = async (text) => {
    try {
        // --- 1. OBTENER LISTA DE PRODUCTOS ---
        const menuItems = await MenuItem.find({}, 'nombre').lean(); 
        const menuList = menuItems.map(item => `ID:${item._id} - Nombre:${item.nombre}`).join('\n');

        const systemPrompt = `Eres un asistente de pedidos de restaurantes, especializado en analizar texto libre y convertirlo a JSON. Tu tarea es la extracción.
        
        Instrucciones CRÍTICAS:
        1. **PRIORIDAD ABSOLUTA:** Analiza primero el texto para extraer el 'nombre' y la 'direccion' del cliente. Busca las frases 'a nombre de', 'mi nombre es', o patrones de dirección.
        2. EXTRACCIÓN DE PRODUCTOS: Para los productos, usa el 'itemId' que mejor coincida con el nombre en la lista.
        3. OUTPUT: El output debe ser *ESTRICTAMENTE* un objeto JSON que se adhiera al esquema. Si un dato (nombre/dirección) no se encuentra, debes devolver el valor como una **cadena vacía ("")** o **null**, pero NUNCA OMITAS EL CAMPO.
        
           --- Menú disponible ---
           ${menuList}
           ------------------------
           
           ESQUEMA JSON REQUERIDO:
           ${JSON.stringify(JSON_SCHEMA_OBJECT, null, 2)}`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini", 
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: text }
            ],
            response_format: { type: "json_object" }, 
        });

        const jsonResponse = response.choices[0]?.message?.content;
        
        if (jsonResponse) {
            const parsedData = JSON.parse(jsonResponse);
            logger.info('[IA Éxito] Datos de pedido estructurados.');
            return parsedData;
        }

        logger.warn('[IA Fallo] OpenAI no devolvió un JSON estructurado válido.');
        return { items: [], clienteInfo: {} };

    } catch (error) {
        logger.error(`Error en la llamada a OpenAI: ${error.message}`);
        return { items: [], clienteInfo: {} };
    }
};