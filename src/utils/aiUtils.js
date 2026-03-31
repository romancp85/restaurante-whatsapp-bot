import logger from './logger.js';
import MenuItem from '../models/MenuItem.js';
import OpenAI from 'openai'; 
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Esquema de respuesta esperado por el bot.
 */
const JSON_SCHEMA_OBJECT = {
    items: [
        { 
            itemId: "ID_DE_24_CARACTERES", 
            quantity: 1, 
            notes: "opcional" 
        }
    ],
    clienteInfo: {
        nombre: "",
        direccion: "",
        metodoPago: "Efectivo | Transferencia | Tarjeta | "
    }
};

export const analizarPedidoConIA = async (text) => {
    try {
        // 1. Obtenemos los productos activos.
        const menuItems = await MenuItem.find({ activo: true }).lean(); 
        
        if (menuItems.length === 0) {
            logger.warn("[IA] El catálogo está vacío en la base de datos.");
            return { items: [], clienteInfo: { nombre: "", direccion: "", metodoPago: "" } };
        }

        const menuList = menuItems.map(item => {
            const idLargo = item._id.toString(); 
            return `- PRODUCTO: "${item.nombre}" | ID_UNICO: ${idLargo}`;
        }).join('\n');

        // Log de depuración
        console.log("--- CATÁLOGO ENVIADO A IA ---");
        console.log(menuList);
        console.log("-------------------------------");

        const systemPrompt = `Eres el "Extractor Técnico" de Yu-K-Bot, un experto en pedidos de comida. 
Tu función es convertir mensajes de clientes en el JSON estructurado solicitado.

REGLAS DE ORO PARA EL ÉXITO:
1. IDENTIFICACIÓN FLEXIBLE: Si el cliente dice "una bbq", "hamburguesa de bbq" o simplemente "bbq", relaciónalo con "Hamburguesa BBQ". Usa el sentido común para variaciones de nombre.
2. ID OBLIGATORIO: El 'itemId' DEBE ser el ID_UNICO de 24 caracteres del catálogo. NUNCA inventes IDs.
3. CANTIDAD: Si el usuario no dice cuántos, asume siempre 1.
4. CLIENTE: Si el mensaje dice "Soy Santos" o "A nombre de Juan", extrae el nombre. Lo mismo para dirección.
5. MÉTODO DE PAGO: Solo acepta "Efectivo", "Transferencia" o "Tarjeta".

CATÁLOGO DISPONIBLE:
${menuList}

RESPONDE ÚNICAMENTE CON UN OBJETO JSON SIGUIENDO ESTE FORMATO:
${JSON.stringify(JSON_SCHEMA_OBJECT, null, 2)}`;

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini", 
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: `Mensaje del cliente: "${text}"` }
            ],
            response_format: { type: "json_object" }, 
            temperature: 0, 
        });

        const jsonResponse = response.choices[0]?.message?.content;
        
        // --- LOG DE RESPUESTA CRUDA ---
        console.log("--- RESPUESTA CRUDA DE OPENAI ---");
        console.log(jsonResponse);
        console.log("---------------------------------");

        if (jsonResponse) {
            const parsedData = JSON.parse(jsonResponse);

            // FILTRO DE SEGURIDAD Y LIMPIEZA
            if (parsedData.items && Array.isArray(parsedData.items)) {
                parsedData.items = parsedData.items.filter(item => {
                    if (!item.itemId) return false;
                    
                    const cleanId = String(item.itemId).trim();
                    // Validamos que sea un Hexadecimal de 24 caracteres (formato MongoDB)
                    const isValidId = /^[0-9a-fA-F]{24}$/.test(cleanId);
                    
                    if (!isValidId) {
                        logger.warn(`[IA] ID inválido descartado: "${item.itemId}"`);
                    } else {
                        item.itemId = cleanId;
                    }
                    return isValidId;
                });
            } else {
                parsedData.items = [];
            }

            // Asegurar que clienteInfo exista para evitar errores de undefined
            if (!parsedData.clienteInfo) {
                parsedData.clienteInfo = { nombre: "", direccion: "", metodoPago: "" };
            }

            logger.info('[IA Éxito] Pedido procesado y validado.');
            return parsedData;
        }

        return { items: [], clienteInfo: { nombre: "", direccion: "", metodoPago: "" } };

    } catch (error) {
        logger.error(`Error en analizarPedidoConIA: ${error.message}`);
        return { items: [], clienteInfo: { nombre: "", direccion: "", metodoPago: "" } };
    }
};