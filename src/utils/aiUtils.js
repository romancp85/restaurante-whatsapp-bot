// src/utils/aiUtils.js
import logger from './logger.js';
import MenuItem from '../models/MenuItem.js';
import OpenAI from 'openai'; 
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Motor de IA: Extrae intenciones de compra y datos de envío.
 * Aplica filtrado inteligente de catálogo para optimizar tokens y precisión.
 */
export const analizarPedidoConIA = async (text, businessId, history = [], restauranteConfig = "", lastProductDiscussed = null, menuMap = []) => {
    try {
        const bId = new mongoose.Types.ObjectId(businessId);

        // --- 1. FILTRADO INTELIGENTE DEL CATÁLOGO ---
        
        // Limpiamos y extraemos palabras clave manejando plurales de forma agnóstica
        const palabrasClave = text.toLowerCase()
            .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "") 
            .split(/\s+/)
            .flatMap(p => {
                // Si la palabra es larga y termina en 's', buscamos también el singular
                if (p.endsWith('s') && p.length > 3) return [p, p.slice(0, -1)];
                return [p];
            })
            .filter(p => p.length > 2);

        if (lastProductDiscussed) palabrasClave.push(lastProductDiscussed.toLowerCase());

        const regexBusqueda = palabrasClave.map(k => new RegExp(k, 'i'));

        // Búsqueda inicial en la DB
        let menuItems = await MenuItem.find({ 
            businessId: bId, 
            activo: true,
            $or: [
                { nombre: { $in: regexBusqueda } },
                { categoria: { $in: regexBusqueda } }
            ]
        }).lean();

        // 🌟 REFUERZO TOP-TIER: Si el filtro es muy restrictivo (< 5 productos),
        // cargamos productos adicionales para dar contexto a la IA.
        if (menuItems.length < 5) {
            const extraItems = await MenuItem.find({ businessId: bId, activo: true }).limit(12).lean();
            const mapaItems = new Map();
            // Unimos resultados evitando duplicados por ID
            [...menuItems, ...extraItems].forEach(item => mapaItems.set(item._id.toString(), item));
            menuItems = Array.from(mapaItems.values());
        }

        logger.info(`[SaaS] Contexto IA cargado: ${menuItems.length} productos disponibles.`);
        
        // --- 2. CONSTRUCCIÓN DEL CATÁLOGO PARA LA IA (Anclaje Semántico) ---
        const menuSimplified = menuItems.map((item) => {
            const mapping = (menuMap || []).find(m => m.itemId.toString() === item._id.toString());
            // El número es parte del nombre para que la IA haga match natural
            const prefix = mapping ? `${mapping.index}. ` : "";

            const mods = item.modificadores?.map(m => 
                `${m.nombre}: ${m.opciones.map(o => o.nombre).join(', ')}`
            ).join(' | ');
            
            return `- PRODUCTO: "${prefix}${item.nombre}" | PRECIO: $${item.precioBase} ${mods ? `| EXTRAS: ${mods}` : ''}`;
        }).join('\n');

        // --- 3. CONSTRUCCIÓN DEL SYSTEM PROMPT ---
        const systemPrompt = `Eres Mateo, el asistente virtual del negocio.
        Tu personalidad es amable, concisa y profesional.

        OBJETIVO: Convertir el mensaje del cliente en un JSON basado ÚNICAMENTE en el catálogo.

        🌟 DIRECTIVAS ESPECÍFICAS Y CONTEXTO:
        ${restauranteConfig}

        REGLAS TÉCNICAS (INMUTABLES):
            1. CONTEXTO: Hablamos de: "${lastProductDiscussed || 'nada aún'}". Úsalo para referencias como "ese" o "sí".
            2. ATRIBUCIÓN: Cualquier detalle o extra DEBE guardarse dentro del objeto de ese producto.
            3. NOTAS GLOBALES: Usa 'notasCocina' o 'notasPago' solo para instrucciones que afecten a TODO el pedido (ej: "traer cambio", "tocar timbre").
            4. RESPUESTA HUMANA (waiterMessage): 
               - Si agregas (ADD): "He anotado tu [Producto]".
               - Si quitas (REMOVE): "Listo, ya quité el/la [Producto]".
               - NUNCA uses "lamentablemente" para confirmar una eliminación.
               - Sé breve. Ejemplo: "He quitado la pizza y anotado tus 2 hamburguesas. ¿Algo más?".
            5. MAPEO SEMÁNTICO: Si el detalle coincide con un modificador del catálogo, úsalo en 'modifiers'. Si es preparación (ej: "bien cocido"), úsalo en 'notes'.
            6. UNICIDAD: El array 'items' debe contener solo los CAMBIOS del último mensaje. No repitas lo confirmado.
            7. IDENTIDAD: Extrae nombres de personas reales, no de productos.
            8. ACCIONES: Cada ítem DEBE llevar su propia 'action' (ADD o REMOVE).
            9. CAMBIOS: Si el usuario cambia X por Y, envía X como REMOVE e Y como ADD.
            10. STOCK: Si el historial dice "solo quedan X", y el usuario dice "sí" o "ok", usa esa cantidad exacta.
            11. LOGÍSTICA: Si el usuario dice "cambiar a recoger", marca 'modoEntrega': 'PICKUP' y deja 'direccion': null.
            12. QUEJAS: Si hay quejas (ej: "faltó algo"), no vendas. Pide disculpas y di que un humano lo revisará.
            13. ATRIBUTOS: No apliques "light" o "frío" de un pedido anterior a uno nuevo automáticamente. Pregunta si hay duda.
            14. CANTIDADES: Si ves "2 refrescos", el 2 es 'quantity'. El catálogo tiene números (ej: 1. Coca), úsalos como referencia de nombre.

        CATÁLOGO DISPONIBLE:
        ${menuSimplified}

        JSON FORMAT:
        {
          "items": [{ 
              "action": "ADD | REMOVE", 
              "productName": "Nombre exacto del catálogo", 
              "quantity": 1, 
              "modifiers": [], 
              "notes": "null" 
          }],
          "status": "COMPLETO | AMBIGUO | NO_DISPONIBLE",
          "waiterMessage": "Respuesta humana breve",
          "extractedData": {
            "nombre": "string | null",
            "direccion": "string | null",
            "metodoPago": "EFECTIVO | TRANSFERENCIA | TARJETA | null",
            "modoEntrega": "DELIVERY | PICKUP | null",
            "notasPago": "string | null",
            "notasCocina": "string | null"
          }
        }`;

        // --- 4. LLAMADA A OPENAI ---
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: systemPrompt },
                ...history.slice(-6),
                { role: "user", content: text }
            ],
            response_format: { type: "json_object" },
            temperature: 0,
        });
    
        const resJSON = JSON.parse(response.choices[0].message.content);
        
        // Limpieza de seguridad
        if (resJSON.items) {
            resJSON.items = resJSON.items.filter(i => i.productName && i.productName !== "null");
        }

        return resJSON;

    } catch (error) {
        logger.error(`Error en IA Motor: ${error.message}`);
        return { items: [], status: "ERROR", waiterMessage: "Disculpa, ¿puedes repetirlo?" };
    }
};