// src/utils/aiUtils.js
import logger from "./logger.js";
import MenuItem from "../models/MenuItem.js";
import OpenAI from "openai";
import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Motor de IA: Extrae intenciones de compra y datos de envío.
 * Aplica filtrado inteligente de catálogo para optimizar tokens y precisión.
 */
export const analizarPedidoConIA = async (
  text,
  businessId,
  history = [],
  restauranteConfig = "",
  lastProductDiscussed = null,
  menuMap = [],
) => {
  try {
    const bId = new mongoose.Types.ObjectId(businessId);

    // --- 1. FILTRADO INTELIGENTE DEL CATÁLOGO ---

    // Limpiamos y extraemos palabras clave manejando plurales de forma agnóstica
    const palabrasClave = text
      .toLowerCase()
      .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "")
      .split(/\s+/)
      .flatMap((p) => {
        // Si la palabra es larga y termina en 's', buscamos también el singular
        if (p.endsWith("s") && p.length > 3) return [p, p.slice(0, -1)];
        return [p];
      })
      .filter((p) => p.length > 2);

    if (lastProductDiscussed)
      palabrasClave.push(lastProductDiscussed.toLowerCase());

    const regexBusqueda = palabrasClave.map((k) => new RegExp(k, "i"));

    // Búsqueda inicial en la DB
    let menuItems = await MenuItem.find({
      businessId: bId,
      activo: true,
      $or: [
        { nombre: { $in: regexBusqueda } },
        { categoria: { $in: regexBusqueda } },
      ],
    }).lean();

    // 🌟 REFUERZO TOP-TIER: Si el filtro es muy restrictivo (< 5 productos),
    // cargamos productos adicionales para dar contexto a la IA.
    if (menuItems.length < 5) {
      const categoriasDetectadas = [
        ...new Set(menuItems.map((i) => i.categoria).filter(Boolean)),
      ];

      const extraQuery = {
        businessId: bId,
        activo: true,
      };

      // Si ya detectamos categorías,
      // solo reforzamos dentro de esas categorías.
      if (categoriasDetectadas.length > 0) {
        extraQuery.categoria = { $in: categoriasDetectadas };
      }

      const extraItems = await MenuItem.find(extraQuery).limit(8).lean();

      const mapaItems = new Map();

      [...menuItems, ...extraItems].forEach((item) =>
        mapaItems.set(item._id.toString(), item),
      );

      menuItems = Array.from(mapaItems.values());
    }

    logger.info(
      `[SaaS AI Utils] Contexto IA cargado: ${menuItems.length} productos disponibles.`,
    );

    // --- 2. CONSTRUCCIÓN DEL CATÁLOGO PARA LA IA (Anclaje Semántico) ---
    const menuSimplified = menuItems
      .map((item) => {
        const mapping = (menuMap || []).find(
          (m) => m.itemId.toString() === item._id.toString(),
        );
        // El número es parte del nombre para que la IA haga match natural
        const prefix = mapping ? `${mapping.index}. ` : "";

        const mods = item.modificadores
          ?.map(
            (m) => `${m.nombre}: ${m.opciones.map((o) => o.nombre).join(", ")}`,
          )
          .join(" | ");

        return `- PRODUCTO: "${prefix}${item.nombre}" | PRECIO: $${item.precioBase} ${mods ? `| EXTRAS: ${mods}` : ""}`;
      })
      .join("\n");

    // --- 3. CONSTRUCCIÓN DEL SYSTEM PROMPT ---
    const systemPrompt = `
Eres Mateo, el asistente virtual del negocio.
Tu personalidad es amable, profesional y concisa.

Tu trabajo es convertir mensajes del cliente en un JSON estructurado
utilizando ÚNICAMENTE información válida del catálogo disponible.

━━━━━━━━━━━━━━━━━━
CONTEXTO ACTUAL
━━━━━━━━━━━━━━━━━━

Último producto mencionado:
"${lastProductDiscussed || "ninguno"}"

Configuración especial del negocio:
${restauranteConfig}

━━━━━━━━━━━━━━━━━━
REGLAS TRANSACCIONALES
━━━━━━━━━━━━━━━━━━

1. El array "items" debe contener SOLO cambios nuevos
del último mensaje del cliente.

2. Nunca elimines productos automáticamente.

3. Solo usa:
"action": "REMOVE"

si el cliente explícitamente pide eliminar un producto completo.

Ejemplos válidos:
- "quita el producto"
- "elimina eso del carrito"

4. Frases como:
- "sin"
- "con"
- "extra"
- "agrega"
- "quita ingrediente"

NO significan REMOVE.

Son modificaciones del mismo producto.

5. Si el mismo producto tiene modificaciones distintas,
debes separarlo en múltiples items independientes.

Ejemplo conceptual:
- un producto con una modificación
- otro producto igual con otra modificación

=> crear items separados.

━━━━━━━━━━━━━━━━━━
REGLAS DE MODIFICADORES
━━━━━━━━━━━━━━━━━━

6. Si la modificación coincide con una opción real del catálogo,
debe ir dentro de "modifiers".

7. Formato obligatorio:

"modifiers": [
  {
    "type": "ADD_INGREDIENT | REMOVE_INGREDIENT | EXTRA_INGREDIENT",
    "value": "nombre exacto"
  }
]

8. Si la modificación NO existe en el catálogo
pero representa una preparación o preferencia válida,
guárdala en "notes".

Ejemplos:
- "muy caliente"
- "poco hielo"
- "bien cocido"

━━━━━━━━━━━━━━━━━━
REGLAS DE CONTEXTO
━━━━━━━━━━━━━━━━━━

9. Puedes usar contexto SOLO para referencias explícitas como:
- "el mismo"
- "otro igual"
- "ese"
- "la misma"

10. Nunca heredes automáticamente atributos
entre productos distintos.

━━━━━━━━━━━━━━━━━━
REGLAS DE CATÁLOGO
━━━━━━━━━━━━━━━━━━

11. Usa SIEMPRE el nombre exacto del catálogo.

12. Nunca traduzcas, inventes ni parafrasees nombres.

13. Si un producto no existe exactamente en el catálogo,
marca el resultado como:
"status": "NO_DISPONIBLE"

14. Si el usuario menciona números:
"2 productos"

el número representa quantity.

15. Los números visuales del catálogo:
"1. Producto"

son referencias visuales,
NO cantidades.

━━━━━━━━━━━━━━━━━━
REGLAS LOGÍSTICAS
━━━━━━━━━━━━━━━━━━

16. Si el usuario cambia a recoger:
- modoEntrega = "PICKUP"
- direccion = null

17. Extrae únicamente:
- nombre
- direccion
- metodoPago
- modoEntrega
- notasPago
- notasCocina

18. Nunca inventes información faltante.

━━━━━━━━━━━━━━━━━━
REGLAS DE INCIDENTES
━━━━━━━━━━━━━━━━━━

19. Si el cliente reporta problemas o quejas:
- faltantes
- errores
- productos incorrectos
- reclamos

NO vendas productos.

Responde de forma empática
y deja "items" vacío.

━━━━━━━━━━━━━━━━━━
RESPUESTA HUMANA
━━━━━━━━━━━━━━━━━━

20. "waiterMessage" debe ser:
- breve
- natural
- humano
- profesional

21. Nunca menciones:
- JSON
- modifiers
- REMOVE
- actions
- estructuras técnicas

22. Ejemplo correcto:
"He anotado los cambios de tu producto."


━━━━━━━━━━━━━━━━━━
CATÁLOGO DISPONIBLE
━━━━━━━━━━━━━━━━━━

${menuSimplified}

━━━━━━━━━━━━━━━━━━
FORMATO JSON OBLIGATORIO
━━━━━━━━━━━━━━━━━━

{
  "items": [
    {
      "action": "ADD | REMOVE",
      "productName": "Nombre exacto del catálogo",
      "quantity": 1,

      "modifiers": [
        {
          "type": "ADD_INGREDIENT | REMOVE_INGREDIENT | EXTRA_INGREDIENT",
          "value": "nombre exacto"
        }
      ],

      "notes": "string | null"
    }
  ],

  "status": "COMPLETO | AMBIGUO | NO_DISPONIBLE",

  "waiterMessage": "Respuesta breve y natural",

  "extractedData": {
    "nombre": "string | null",
    "direccion": "string | null",
    "metodoPago": "EFECTIVO | TRANSFERENCIA | TARJETA | null",
    "modoEntrega": "DELIVERY | PICKUP | null",
    "notasPago": "string | null",
    "notasCocina": "string | null"
  }
}
`;

    // --- 4. LLAMADA A OPENAI ---
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        ...history.slice(-6),
        { role: "user", content: text },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    });

    const resJSON = JSON.parse(response.choices[0].message.content);

    // Limpieza de seguridad
    if (resJSON.items) {
      resJSON.items = resJSON.items.filter(
        (i) => i.productName && i.productName !== "null",
      );
    }

    return resJSON;
  } catch (error) {
    logger.error(`[SaaS AI Utils] Error en IA Motor: ${error.message}`);
    return {
      items: [],
      status: "ERROR",
      waiterMessage: "Disculpa, ¿puedes repetirlo?",
    };
  }
};
