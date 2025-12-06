// src/handlers/flowHandler.js - CÓDIGO FINAL CORREGIDO Y COMPLETO

import axios from 'axios';
import mongoose from 'mongoose'; 
import { getMenu } from '../services/menuService.js';
import { formatPrice } from '../utils/formatter.js';
import logger from '../utils/logger.js';
import MenuItem from '../models/MenuItem.js'; 
import Pedido from '../models/Pedido.js';   
import { updateUserSession, deleteUserSession } from '../services/sessionService.js';

const TOKEN = process.env.WHATSAPP_TOKEN?.trim();
const PHONE_ID = process.env.WHATSAPP_PHONE_ID?.trim();

// === FUNCIONES AUXILIARES ===

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
// ===============================================

/**
 * Procesa la lista de ítems extraídos por la IA y los añade al carrito de la sesión.
 */
async function agregarItemsIAAlCarrito(from, itemsAñadir, session) {
    const itemsAgregados = [];

    for (const item of itemsAñadir) {
        const itemId = item.itemId;
        const cantidad = Math.max(1, parseInt(item.cantidad, 10) || 1); 

        try {
            // Usamos findById que acepta el string ID
            const menu = await MenuItem.findById(itemId);

            if (!menu) {
                logger.warn(`IA devolvió un itemId no encontrado: ${itemId}`);
                continue; 
            }

            // Lógica de STOCK
            const disponible = menu.cantidad_diaria - menu.vendidas_hoy;
            
            // 🛑 CORRECCIÓN CRÍTICA: Buscar usando item.itemId si existe, o _id.
            // Esto asegura que podemos encontrar ítems agregados por IA o por botón.
            const itemKey = menu._id.toString(); 
            const existente = session.cart.find(p => (p.itemId || p._id)?.toString() === itemKey);
            
            const cantidadEnCarrito = existente ? existente.cantidad : 0;
            
            if (cantidadEnCarrito + cantidad > disponible) {
                await enviarTexto(from, `¡Ups! Solo nos quedan ${disponible} unidades de *${menu.nombre}* hoy. No se añadió la cantidad solicitada.`);
                continue;
            }
            
            // Si pasa la verificación, lo agrega al carrito
            session.cart.push({
                // Usamos itemId consistentemente para la clave del carrito
                itemId: menu._id.toString(), 
                nombre: menu.nombre,
                precio: menu.precio,
                cantidad: cantidad,
                subtotal: menu.precio * cantidad
            });
            session.total = (session.total || 0) + (menu.precio * cantidad);
            itemsAgregados.push(`${cantidad}x ${menu.nombre}`);

        } catch (error) {
            logger.error(`Error al procesar ítem IA (${itemId}): ${error.message}`);
        }
    }
    
    // 3. Notificar al usuario (si se añadió algo)
    if (itemsAgregados.length > 0) {
        const nombresAgregados = itemsAgregados.join(', ');
        await enviarTexto(from, `¡Entendido! Añadí al carrito: *${nombresAgregados}*.\n\nEscribe *menú* o *finalizar* para completar tu pedido.`);
        await enviarBotonFinalizar(from);
    } else if (itemsAñadir.length > 0) {
        await enviarTexto(from, 'Lo siento, no pude encontrar o procesar los productos que mencionaste.');
    }

    await updateUserSession(from, session);
    return itemsAgregados;
}


// === HANDLERS DE MENSAJES (El resto del flow es el mismo, solo se muestra la confirmación final por ser crítica) ===

const enviarBienvenida = async (to) => { 
    await enviarMensaje(to, {
        type: "interactive",
        interactive: {
            type: "button",
            body: { text: "*¡BIENVENIDO A TU HAMBURGUESERÍA!* \n\n¿Qué se te antoja hoy, rey?" },
            footer: { text: "Elige una opción" },
            action: { buttons: [
                { type: "reply", reply: { id: "VER_MENU", title: "Ver Menú" } },
                { type: "reply", reply: { id: "OFERTAS", title: "Ofertas" } }
            ] }
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
            action: { buttons: [
                { type: "reply", reply: { id: "CAT_HAMBURGUESAS", title: "Hamburguesas" } },
                { type: "reply", reply: { id: "CAT_COMPLEMENTOS", title: "Complementos" } },
                { type: "reply", reply: { id: "CAT_BEBIDAS", title: "Bebidas" } }
            ] }
        }
    });

    await enviarMensaje(to, { // Segundo mensaje
        type: "interactive",
        interactive: {
            type: "button",
            body: { text: "¿Quieres un combo?" },
            action: { buttons: [{ type: "reply", reply: { id: "CAT_COMBOS", title: "Combos" } }] }
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

const agregarAlCarrito = async (to, itemId, session) => {
    const menu = await getMenu();
    const item = menu.find(i => (i._id.$oid || i._id).toString() === itemId); 

    if (!item) {
        await enviarTexto(to, "Lo siento, ese producto ya no está disponible.");
        return;
    }

    // Lógica de VERIFICACIÓN DE STOCK
    const disponible = item.cantidad_diaria - item.vendidas_hoy;
    // 🛑 CORRECCIÓN: Usar p.itemId para consistencia 🛑
    const existente = session.cart.find(p => (p.itemId || p._id)?.toString() === itemId);
    const cantidadEnCarrito = existente ? existente.cantidad : 0;
    
    if (cantidadEnCarrito + 1 > disponible) {
        await enviarTexto(to, `¡Ups! Solo nos quedan ${disponible} unidades de *${item.nombre}* hoy.`);
        await enviarBotonFinalizar(to);
        return;
    }

    if (existente) {
        existente.cantidad += 1;
    } else {
        session.cart.push({ itemId: item._id.toString(), nombre: item.nombre, precio: item.precio, cantidad: 1 });
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
            action: { buttons: [
                { type: "reply", reply: { id: "FINALIZAR", title: "Finalizar" } },
                { type: "reply", reply: { id: "VER_MENU", title: "Agregar más" } }
            ] }
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

const enviarConfirmacionFinal = async (to, session) => {
    const subtotal = session.cart.reduce((s, i) => s + i.precio * i.cantidad, 0);
    const costoEnvio = 3000;
    const total = subtotal + costoEnvio;

    try {
        const nuevoPedido = await Pedido.create({
            telefonoCliente: to,
            nombreCliente: session.name || 'Cliente sin nombre',
            direccionEntrega: session.address || 'Sin dirección',
            items: session.cart.map(i => ({
                // 🛑 CORRECTO: Convertir el string ID a un ObjectId de Mongoose 🛑
                itemId: new mongoose.Types.ObjectId(i.itemId), 
                nombre: i.nombre,
                precioUnitario: i.precio,
                cantidad: i.cantidad,
                notas: ''
            })),
            subtotal,
            costoEnvio,
            total,
            metodoPago: 'Efectivo',
            estado: 'Pendiente'
        });

        const itemUpdates = session.cart.map(item => 
            MenuItem.findByIdAndUpdate(item.itemId, { $inc: { vendidas_hoy: item.cantidad } }) 
        );
        await Promise.all(itemUpdates); 
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
    agregarItemsIAAlCarrito,
    enviarBotonFinalizar,
    enviarResumen,
    enviarConfirmacionFinal,
    enviarTexto,
    enviarMensaje
};