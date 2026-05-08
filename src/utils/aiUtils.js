// src/utils/aiUtils.js
import logger from './logger.js';
import MenuItem from '../models/MenuItem.js';
import OpenAI from 'openai'; 
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 🌟 CAMBIO EN LA FIRMA: Añadimos menuMap al final
export const analizarPedidoConIA = async (text, businessId, history = [], restauranteConfig = {}, lastProductDiscussed = null, menuMap = []) => {
    try {
        const { 
            nombreBot = "Mateo", 
            rol = "Asistente Virtual",
            personalidad = "conciso y profesional",
            directivasIA = [] 
        } = restauranteConfig;

        const bId = new mongoose.Types.ObjectId(businessId);

        // 1. FILTRADO INTELIGENTE DEL CATÁLOGO (Mejorado)
        // Limpiamos el texto de comas, puntos y signos para extraer palabras puras
        const palabrasClave = text.toLowerCase()
            .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "") 
            .split(/\s+/)
            .filter(p => p.length > 2);

        if (lastProductDiscussed) palabrasClave.push(lastProductDiscussed.toLowerCase());

        // 🌟 NUEVO: Detectar si el usuario escribió algún número (índice)
        const numerosMencionados = palabrasClave
            .filter(p => !isNaN(p))
            .map(n => parseInt(n));

        // Creamos un set de expresiones regulares para búsqueda parcial
        const regexBusqueda = palabrasClave.map(k => new RegExp(k, 'i'));

         // 2. BUSCAR EN EL MAPA DE NÚMEROS (menuMap)
        // Si el usuario dijo "la 2", buscamos qué ID tiene el número 2
        let idsPorNumero = [];
        if (numerosMencionados.length > 0 && menuMap) {
            idsPorNumero = menuMap
                .filter(m => numerosMencionados.includes(m.index))
                .map(m => new mongoose.Types.ObjectId(m.itemId));
        }

        let menuItems = await MenuItem.find({ 
            businessId: bId, 
            activo: true,
            $or: [
                { _id: { $in: idsPorNumero } }, // 👈 BUSQUEDA POR NÚMERO
                { nombre: { $in: regexBusqueda } },
                { categoria: { $in: regexBusqueda } },
                { "modificadores.opciones.nombre": { $in: regexBusqueda } } // Busca también en ingredientes
            ]
        }).lean();

        // 🌟 REGLA DE ORO: Si encontramos pocos productos, cargamos la categoría completa 
        // de los productos encontrados para darle contexto a la IA.
        if (menuItems.length > 0 && menuItems.length < 10) {
            const categoriasEncontradas = [...new Set(menuItems.map(i => i.categoria))];
            const complementosCategoria = await MenuItem.find({
                businessId: bId,
                activo: true,
                categoria: { $in: categoriasEncontradas }
            }).limit(15).lean();
            
            // Unimos y eliminamos duplicados por ID
            const mapaItems = new Map();
            [...menuItems, ...complementosCategoria].forEach(item => mapaItems.set(item._id.toString(), item));
            menuItems = Array.from(mapaItems.values());
        }

        // Fallback total si sigue vacío
        if (menuItems.length === 0) {
            menuItems = await MenuItem.find({ businessId: bId, activo: true }).limit(15).lean();
        }

        logger.info(`[SaaS] Productos cargados para IA: ${menuItems.length} (${menuItems.map(i => i.nombre).join(', ')})`);
        
        // 2. CONSTRUCCIÓN DEL CATÁLOGO PARA LA IA (Con índices para mayor precisión)
// 🌟 2. CONSTRUCCIÓN DEL CATÁLOGO (CORREGIDO: Usando el parámetro menuMap)
        const menuSimplified = menuItems.map((item) => {
            // Buscamos el número que tiene este item en el mapa actual del cliente
            const mapping = (menuMap || []).find(m => m.itemId.toString() === item._id.toString());
            const prefix = mapping ? `[${mapping.index}] ` : "";

            const mods = item.modificadores?.map(m => 
                `${m.nombre}: ${m.opciones.map(o => o.nombre).join(', ')}`
            ).join(' | ');
            
            return `- PRODUCTO: ${prefix}"${item.nombre}" | PRECIO: $${item.precioBase} ${mods ? `| OPCIONES: ${mods}` : ''}`;
        }).join('\n');

        // 3. ENSAMBLAJE DE DIRECTIVAS DEL NEGOCIO
        const reglasDelNegocio = directivasIA.length > 0 
            ? directivasIA.map((r, i) => `${i + 1}. ${r}`).join('\n')
            : "Atiende con amabilidad y procesa el pedido de forma estándar.";

        // 4. CONSTRUCCIÓN DEL SYSTEM PROMPT (ÚNICO Y LIMPIO)
        const systemPrompt = `Eres ${nombreBot}, el ${rol} del negocio. Tu personalidad es ${personalidad}.

        OBJETIVO: Convertir el mensaje del cliente en un JSON basado ÚNICAMENTE en el catálogo.

        🌟 DIRECTIVAS ESPECÍFICAS DE ESTE NEGOCIO (PRIORIDAD ALTA):
        ${reglasDelNegocio}

        REGLAS TÉCNICAS (INMUTABLES):
            1. CONTEXTO: Estás hablando de: "${lastProductDiscussed || 'nada aún'}". Úsalo para referencias como "ese", "el mismo" o "sí".
            2. ATRIBUCIÓN DE PRODUCTO: Cualquier detalle, extra o modificación mencionado junto a un producto (ej: "Margarita con mucho tomate") DEBE guardarse estrictamente dentro del objeto de ese producto (en 'modifiers' si hay similitud semántica con el catálogo o en 'notes' si es una instrucción). NUNCA uses 'notasCocina' global para detalles de un producto específico.
            3. NOTAS GLOBALES (extractedData): Usa 'notasCocina' o 'notasPago' ÚNICAMENTE para instrucciones que afecten a todo el pedido o a la entrega (ej: "tocar timbre fuerte", "traer cambio de 500", "sin cubiertos").
            4. RESPUESTA HUMANA (waiterMessage): 
               - Si agregas productos (ADD), usa: "He anotado tu [Producto]".
               - Si quitas productos (REMOVE), usa: "Listo, ya quité el/la [Producto] de tu carrito".
               - Solo usa "Lamentablemente no contamos con..." si el usuario pidió algo que NO está en el catálogo. 
               - NUNCA uses "lamentablemente" para confirmar una eliminación solicitada por el usuario.
               - Sé breve y natural. Ejemplo de cambio: "He quitado la pizza y anotado tus 2 hamburguesas. ¿Algo más?".            5. MAPEO SEMÁNTICO: Si el detalle del usuario coincide por similitud con un modificador (ej: "tomate" -> "Tomate Cherry"), selecciónalo en 'modifiers'. Si es una instrucción de preparación (ej: "bien cocido"), úsalo en 'notes' del ítem.
            6. UNICIDAD: El array 'items' debe contener solo lo solicitado en el ÚLTIMO mensaje. No repitas lo ya confirmado.
            7. IDENTIDAD: Extrae nombres de personas reales. NUNCA uses nombres de productos como nombres de clientes.
            8. ACCIONES: Cada ítem en el array 'items' debe llevar su propia 'action' (ADD o REMOVE). 
            9. CAMBIOS: Si el usuario quiere cambiar un producto por otro, incluye ambos en el array 'items': el que se va con action "REMOVE" y el que llega con action "ADD".
            10. CONFIRMACIONES DE STOCK: Si el último mensaje del sistema mencionó una cantidad limitada disponible (ej: "solo quedan 2") y el usuario responde "sí",  "agregala", "agregamela", "damela", "dame esos", "ok" o similares, asume que la cantidad deseada es EXACTAMENTE la cantidad disponible mencionada anteriormente. No inventes números.

            CATÁLOGO DISPONIBLE:
        ${menuSimplified}

        JSON FORMAT (ESTRICTO):
        {
        "items": [{ 
            "action": "ADD | REMOVE", // 🌟 Ahora la acción es por producto
            "productName": "Nombre exacto del catálogo", 
            "quantity": 1, 
            "modifiers": [], 
            "notes": "Instrucción o null" 
        }],
        "status": "COMPLETO | AMBIGUO | NO_DISPONIBLE",
        "waiterMessage": "Respuesta humana breve",
          "extractedData": {
            "nombre": "string o null",
            "direccion": "string o null",
            "metodoPago": "EFECTIVO | TRANSFERENCIA | TARJETA | null",
            "modoEntrega": "DELIVERY | PICKUP | null",
            "notasPago": "Instrucción de pago (ej: billete de 500)",
            "notasCocina": "Instrucción general (ej: sin cubiertos)"
          }
        }`;

        // 5. LLAMADA A GPT-4o-mini
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