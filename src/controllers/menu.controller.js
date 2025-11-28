// src/controllers/menu.controller.js
import MenuItem from '../models/MenuItem.js';

// GET /menu → devuelve solo items activos
export const getMenu = async (req, res) => {
  try {
    const menu = await MenuItem.find({ activo: true })
      .select('nombre precio cantidad_diaria vendidas_hoy alerta_en')
      .sort({ categoria: 1, nombre: 1 });

    res.json({
      mensaje: "🍔 Menú del día",
      total_items: menu.length,
      menu
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// POST /order → simula que un cliente pide algo
export const procesarOrden = async (req, res) => {
  const { itemId, cantidad = 1 } = req.body;

  try {
    const item = await MenuItem.findById(itemId);
    if (!item) return res.status(404).json({ error: "Producto no encontrado" });
    if (!item.activo) return res.status(400).json({ error: `${item.nombre} agotado por hoy` });

    item.vendidas_hoy += cantidad;

    // Lógica de alerta y desactivación automática
    if (item.vendidas_hoy >= item.cantidad_diaria) {
      item.activo = false;
      console.log(`\nALERTA ROJA: Se acabaron las ${item.nombre} hoy!`);
    } else if (item.vendidas_hoy >= item.alerta_en && item.vendidas_hoy - cantidad < item.alerta_en) {
      console.log(`\nALERTA AMARILLA: Quedan pocas ${item.nombre} (vendidas: ${item.vendidas_hoy}/${item.cantidad_diaria})`);
      console.log(`→ Enviar mensaje al dueño: "¿Quieres hacer más?"`);
    }

    await item.save();

    res.json({
      mensaje: `Orden recibida: ${cantidad} ${item.nombre}`,
      stock_restante: item.cantidad_diaria - item.vendidas_hoy,
      activo: item.activo
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};