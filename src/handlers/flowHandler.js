// src/handlers/flowHandler.js - Inicio
import { getMenu } from '../services/menuService.js';
import { formatPrice } from '../utils/formatter.js';
import logger from '../utils/logger.js';
import axios from 'axios';
// NUEVAS IMPORTACIONES:
import MenuItem from '../models/MenuItem.js'; // Importamos el modelo de Mongoose para el stock
import Pedido from '../models/Pedido.js';   // Importamos el modelo para guardar pedidos
import { deleteUserSession } from '../services/sessionService.js'; // Necesario para limpiar la sesión al finalizar

const TOKEN = process.env.WHATSAPP_TOKEN?.trim(); 
const PHONE_ID = process.env.WHATSAPP_PHONE_ID?.trim();

// ===== AÑADIR ESTE BLOQUE DE CÓDIGO =====
if (!TOKEN || !PHONE_ID) {
    console.error("==================================================================");
    console.error("FATAL ERROR: TOKEN o PHONE_ID no están definidos en flowHandler.js");
    console.error("Asegúrate de que .env esté en la raíz y que 'dotenv/config' esté en server.js");
    console.error("==================================================================");
    // Para que el servidor siga corriendo pero el handler falle inmediatamente
    // Puedes incluso salir del proceso con process.exit(1) si estás en modo strict
}
// =========================================

const enviarMensaje = async (to, message) => {
  try {
    await axios.post(`https://graph.facebook.com/v20.0/${PHONE_ID}/messages`, {
      messaging_product: "whatsapp",
      to,
      ...message
    }, { headers: { Authorization: `Bearer ${TOKEN}` } });
    logger.info(`Mensaje enviado a ${to}`);
  } catch (error) {
    logger.error('Error enviando mensaje:', error.response?.data || error.message);
  }
};

const enviarTexto = async (to, texto) => {
  await enviarMensaje(to, { type: "text", text: { body: texto } });
};

const enviarBienvenida = async (to) => {
  await enviarMensaje(to, {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: "*¡BIENVENIDO A TU HAMBURGUESERÍA!* \n\n¿Qué se te antoja hoy, rey?" },
      footer: { text: "Elige una opción" },
      action: {
        buttons: [
          { type: "reply", reply: { id: "VER_MENU", title: "Ver Menú" } },
          { type: "reply", reply: { id: "OFERTAS", title: "Ofertas" } }
        ]
      }
    }
  });
};

const enviarMenuPrincipal = async (to) => {
  await enviarMensaje(to, {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: "*MENU HAMBURGUESAS EL REY*\n\nElige tu categoría:" },
      footer: { text: "Toca un botón" },
      action: {
        buttons: [
          { type: "reply", reply: { id: "CAT_HAMBURGUESAS", title: "Hamburguesas" } },
          { type: "reply", reply: { id: "CAT_COMPLEMENTOS", title: "Complementos" } },
          { type: "reply", reply: { id: "CAT_BEBIDAS", title: "Bebidas" } }
        ]
      }
    }
  });

  // Mensaje adicional con el cuarto botón (Meta solo permite 3 botones por mensaje)
  await enviarMensaje(to, {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: "¿Quieres un combo?" },
      action: {
        buttons: [
          { type: "reply", reply: { id: "CAT_COMBOS", title: "Combos" } }
        ]
      }
    }
  });
};

const enviarCategoria = async (to, categoria, pagina = 0) => {
  const menu = await getMenu();
  const items = menu.filter(i => i.categoria.toLowerCase() === categoria.toLowerCase());

  if (items.length === 0) {
    await enviarTexto(to, `No hay productos en *${categoria}* por ahora`);
    return;
  }

  const POR_PAGINA = 2;
  const totalPaginas = Math.ceil(items.length / POR_PAGINA);
  const inicio = pagina * POR_PAGINA;
  const paginaItems = items.slice(inicio, inicio + POR_PAGINA);

  let texto = `*${categoria.toUpperCase()}* (Página ${pagina + 1}/${totalPaginas})\n\n`;
  texto += paginaItems.map((i, idx) => {
    const num = inicio + idx + 1;
    return `${num}️⃣ *${i.nombre}* - ${formatPrice(i.precio)}`;
  }).join('\n');
  texto += "\n\nToca para agregar al carrito";

  const buttons = paginaItems.map((item, idx) => ({
    type: "reply",
    reply: { id: `ADD_${item._id.$oid || item._id}`, title: `${inicio + idx + 1}️⃣ ${item.nombre.substring(0, 14)}` }
  }));

  const nav = [];
  if (pagina > 0) {
    nav.push({ type: "reply", reply: { id: `PAGE_${categoria}_${pagina - 1}`, title: "Anterior" } });
  }
  if (pagina < totalPaginas - 1) {
    nav.push({ type: "reply", reply: { id: `PAGE_${categoria}_${pagina + 1}`, title: "Siguiente" } });
  }
  if (nav.length + buttons.length < 3) {
    nav.push({ type: "reply", reply: { id: "VER_MENU", title: "Menú" } });
  }

  const todosLosBotones = [...buttons, ...nav].slice(0, 3);

  await enviarMensaje(to, {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: texto },
      footer: { text: `Mostrando ${inicio + 1}-${inicio + paginaItems.length} de ${items.length}` },
      action: { buttons: todosLosBotones }
    }
  });
};

// src/handlers/flowHandler.js - FUNCIÓN MEJORADA
const agregarAlCarrito = async (to, itemId, session) => {
    const menu = await getMenu();
    // NOTA: Usamos find(i => i._id.toString() === itemId) para garantizar que funciona con el ID de Mongo
    const item = menu.find(i => (i._id.$oid || i._id).toString() === itemId); 

    if (!item) {
        await enviarTexto(to, "Lo siento, ese producto ya no está disponible.");
        return;
    }

    // 🛑 Lógica de VERIFICACIÓN DE STOCK 🛑
    // Calculamos el stock disponible
    const disponible = item.cantidad_diaria - item.vendidas_hoy;
    // Checamos cuántos ítems de este tipo ya tiene el cliente en su carrito (si existe)
    const existente = session.cart.find(p => (p._id.$oid || p._id).toString() === itemId);
    const cantidadEnCarrito = existente ? existente.cantidad : 0;
    
    if (cantidadEnCarrito + 1 > disponible) {
        await enviarTexto(to, `¡Ups! Solo nos quedan ${disponible} unidades de *${item.nombre}* hoy.`);
        await enviarBotonFinalizar(to);
        return;
    }
    // 🛑 FIN DE LÓGICA DE STOCK 🛑

    // Si pasa la verificación, lo agrega al carrito
    if (existente) {
        existente.cantidad += 1;
    } else {
        session.cart.push({ ...item, cantidad: 1 });
    }

    await enviarTexto(to, `¡*${item.nombre}* agregado al carrito! (${session.cart.reduce((a,b)=>a+b.cantidad,0)} ítems)`);
    await enviarBotonFinalizar(to);
};

const enviarBotonFinalizar = async (to) => {
  await enviarMensaje(to, {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: "¡Tu pedido está listo!\n¿Quieres agregar algo más?" },
      action: {
        buttons: [
          { type: "reply", reply: { id: "FINALIZAR", title: "Finalizar" } },
          { type: "reply", reply: { id: "VER_MENU", title: "Agregar más" } }
        ]
      }
    }
  });
};

const enviarResumen = async (to, session) => {
  let texto = "*RESUMEN DE TU PEDIDO*\n\n";
  let total = 0;
  session.cart.forEach(p => {
    const subtotal = p.precio * p.cantidad / 100;
    texto += `• ${p.cantidad}x *${p.nombre}* - ${formatPrice(p.precio * p.cantidad)}\n`;
    total += subtotal;
  });
  texto += `\n*Subtotal:* ${formatPrice(total*100)}\n*Envío:* $30.00\n*TOTAL:* ${formatPrice((total*100)+3000)}`;
  await enviarTexto(to, texto);
  await enviarTexto(to, "\n¿Cuál es tu nombre para el pedido?");
};

// src/handlers/flowHandler.js - FUNCIÓN CRÍTICA MEJORADA
const enviarConfirmacionFinal = async (to, session) => {
    // Calcular totales (en centavos, como en el modelo)
    const subtotal = session.cart.reduce((s, i) => s + i.precio * i.cantidad, 0);
    const costoEnvio = 3000; // $30.00 MXN en centavos
    const total = subtotal + costoEnvio;

    // 1. 💾 CREAR EL DOCUMENTO DEL PEDIDO EN MONGODB
    try {
        const nuevoPedido = await Pedido.create({
            telefonoCliente: to, // El 'from' de WhatsApp es el teléfono
            nombreCliente: session.name || 'Cliente sin nombre',
            direccionEntrega: session.address || 'Sin dirección',
            items: session.cart.map(i => ({
                itemId: i._id,
                nombre: i.nombre,
                precioUnitario: i.precio,
                cantidad: i.cantidad,
                notas: '' // Aquí irían las notas si las hubiéramos implementado
            })),
            subtotal,
            costoEnvio,
            total,
            metodoPago: 'Efectivo', // Asumimos efectivo por defecto hasta preguntar
            estado: 'Pendiente'
        });

        // 2. 📉 ACTUALIZAR EL STOCK EN MONGODB (por cada ítem vendido)
        const itemUpdates = session.cart.map(item => 
            MenuItem.findByIdAndUpdate(item._id, { $inc: { vendidas_hoy: item.cantidad } })
        );
        await Promise.all(itemUpdates); // Ejecuta todas las actualizaciones de stock en paralelo
        
        // 3. 🗑️ ELIMINAR LA SESIÓN DE REDIS (Importamos deleteUserSession al inicio)
        await deleteUserSession(to);

        const lista = session.cart.map(p => `${p.cantidad}x ${p.nombre}`).join('\n');
        
        await enviarTexto(to, `
✅ ¡PEDIDO NÚMERO *#${nuevoPedido._id.toString().slice(-6)}* CONFIRMADO! ✅

*Nombre:* ${session.name}
*Dirección:* ${session.address}

*Productos:*
${lista}

*Total:* ${formatPrice(total)}

Un agente te contactará para confirmar el pago y el tiempo de entrega.
        `);
        
    } catch (error) {
        logger.error('Error al guardar pedido o actualizar stock:', error);
        await enviarTexto(to, "Hubo un error al procesar tu pedido final. Por favor, intenta de nuevo o comunícate directamente.");
    }
};

// EXPORTAMOS TODO LO QUE EXISTE
export {
  enviarBienvenida,
  enviarMenuPrincipal,
  enviarCategoria,
  agregarAlCarrito,
  enviarBotonFinalizar,
  enviarResumen,
  enviarConfirmacionFinal,
  enviarTexto,
  enviarMensaje
};