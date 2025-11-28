// src/whatsapp/webhook.js - VERSIÓN INDESTRUCTIBLE FINAL (FUNCIONA SÍ O SÍ)
import axios from 'axios';

const TOKEN = process.env.WHATSAPP_TOKEN?.trim();
const PHONE_ID = process.env.WHATSAPP_PHONE_ID;

export const verifyWebhook = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode && token && mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.send(challenge);
  }
  res.sendStatus(403);
};

export const receiveMessage = async (req, res) => {
  try {
    const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message) return res.sendStatus(200);

    const from = message.from;
    const texto = message.text?.body || '';

    if (['hola', 'menu', 'menú', 'pedir', 'holi', 'buenas'].some(p => texto.toLowerCase().includes(p))) {
      await enviarMenu(from);
      return res.sendStatus(200);
    }

    if (message.interactive?.type === 'button_reply' && message.interactive.button_reply.id === 'PEDIR') {
      await enviarMenu(from);
      return res.sendStatus(200);
    }

    if (message.type === 'text') {
      await procesarPedidoTexto(from, texto);
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('Error en webhook:', error);
    res.sendStatus(500);
  }
};

const enviarMenu = async (to) => {
  try {
    const { data } = await axios.get('http://localhost:3000/api/menu');
    const items = data.menu || [];

    if (items.length === 0) {
      await enviarTexto(to, "Lo siento, hoy todo está agotado 😔\nVuelve mañana");
      return;
  }

    let textoMenu = "*¡MENÚ DISPONIBLE HOY!* 🔥\n\n";
    items.forEach((item, i) => {
      const stock = item.cantidad_diaria - (item.vendidas_hoy || 0);
      textoMenu += `${i + 1}️⃣ *${item.nombre}*\n`;
      textoMenu += `   $${item.precio.toLocaleString()} MXN • Quedan: ${stock}\n\n`;
    });
    textoMenu += "Escribe lo que quieras (ej: 2 cocas light, 3 veganas sin mayonesa)";

    await enviarMensaje(to, {
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: textoMenu },
        action: { buttons: [{ type: "reply", reply: { id: "PEDIR", title: "Hacer pedido" } }] }
      }
    });
  } catch (e) {
    console.error("Error menú:", e);
    await enviarTexto(to, "Error cargando menú 😔");
  }
};

const procesarPedidoTexto = async (to, textoOriginal) => {
  try {
    const { data } = await axios.get('http://localhost:3000/api/menu');
    const items = data.menu || [];

    if (items.length === 0) {
      await enviarTexto(to, "No hay productos disponibles 😔");
      return;
    }

    const texto = textoOriginal.toLowerCase().replace(/\n/g, ' ').trim();
    let respuesta = "*¡TU PEDIDO RECIBIDO!* 🔥\n\n";
    let total = 0;
    const procesados = new Set();

    // === SOPORTE PARA "SOLO NÚMERO" (ej: "5") ===
    const soloNumeroMatch = textoOriginal.trim().match(/^(\d+)$/);
    if (soloNumeroMatch) {
      const num = parseInt(soloNumeroMatch[1]) - 1; // porque el menú empieza en 1
      if (num >= 0 && num < items.length) {
        const item = items[num];
        const stock = item.cantidad_diaria - (item.vendidas_hoy || 0);
        if (stock > 0) {
          await axios.post('http://localhost:3000/api/order', { itemId: item._id, cantidad: 1 });
          respuesta += `✅ *${item.nombre}* × 1\n`;
          respuesta += `   $${item.precio.toLocaleString()} MXN\n\n`;
          total += item.precio;
        } else {
          respuesta += `❌ *${item.nombre}* - Agotado\n\n`;
        }
        respuesta += `*_TOTAL: $${total.toLocaleString()} MXN_*\n\n¡En cocina! 🧑‍🍳`;
        await enviarTexto(to, respuesta);
        return;
      }
    }
    // === FIN SOPORTE SOLO NÚMERO ===

    // === RESTO DEL PARSER (texto normal) ===
    const claves = {
      "Hamburguesa Clásica": ["clásica", "clasica", "clásicas", "clasicas", "hamburguesa"],
      "Hamburguesa BBQ": ["bbq", "barbacoa"],
      "Hamburguesa Vegana": ["vegana", "veganas", "veggie"],
      "Coca Cola": ["coca", "cocas", "coca light", "refresco", "cola"],
      "Papas Fritas": ["papas", "fritas"]
    };

    for (const [nombreItem, palabras] of Object.entries(claves)) {
      if (procesados.has(nombreItem)) continue;
      const coincide = palabras.some(p => texto.includes(p));
      if (!coincide) continue;

      const item = items.find(i => i.nombre.toLowerCase() === nombreItem.toLowerCase());
      if (!item) continue;

      const stockDisponible = item.cantidad_diaria - (item.vendidas_hoy || 0);
      if (stockDisponible <= 0) {
        respuesta += `❌ *${nombreItem}* - Agotado\n\n`;
        procesados.add(nombreItem);
        continue;
      }

      let cantidad = 1;
      const palabraEncontrada = palabras.find(p => texto.includes(p));
      const antes = texto.split(palabraEncontrada)[0];
      const numeroMatch = antes.match(/(\d+)\s*$/);
      if (numeroMatch) cantidad = parseInt(numeroMatch[1]);

      cantidad = Math.min(cantidad, stockDisponible);

      for (let i = 0; i < cantidad; i++) {
        await axios.post('http://localhost:3000/api/order', { itemId: item._id, cantidad: 1 });
      }

      total += item.precio * cantidad;

      const resto = textoOriginal.split(new RegExp(palabraEncontrada, 'i'))[1] || "";
      let comentario = resto
        .replace(/^[sS](\s|$)/, '')
        .split(/\d|con|sin| y | para | por favor/i)[0]
        .trim();

      respuesta += `✅ *${item.nombre}* × ${cantidad}\n`;
      respuesta += `   $${(item.precio * cantidad).toLocaleString()} MXN\n`;
      if (comentario) respuesta += `   ↳ _${comentario}_\n`;
      respuesta += `\n`;

      procesados.add(nombreItem);
    }

    if (total === 0) {
      await enviarTexto(to, "No encontré nada disponible 😔\nEscribe *menú*");
      return;
    }

    respuesta += `*_TOTAL: $${total.toLocaleString()} MXN_*\n\n`;
    respuesta += "¡Tu pedido está en cocina! 🧑‍🍳\n¿Algo más?";
    await enviarTexto(to, respuesta);

  } catch (e) {
    console.error("ERROR:", e);
    await enviarTexto(to, "Error en cocina 😔");
  }
};

const enviarTexto = async (to, texto) => {
  await enviarMensaje(to, { type: "text", text: { body: texto } });
};

const enviarMensaje = async (to, message) => {
  try {
    await axios.post(`https://graph.facebook.com/v20.0/${PHONE_ID}/messages`, {
      messaging_product: "whatsapp",
      to,
      ...message
    }, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });
  } catch (error) {
    console.error('ERROR WhatsApp:', error.response?.data || error.message);
  }
};