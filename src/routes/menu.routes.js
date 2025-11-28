// src/routes/menu.routes.js - VERSIÓN FINAL SIN ERRORES DE SINTAXIS
import express from 'express';
import MenuItem from '../models/MenuItem.js';

const router = express.Router();

// GET /api/menu → solo productos con stock real disponible
router.get('/menu', async (req, res) => {
  try {
    const menu = await MenuItem.find({}).lean();

    // Filtramos en JavaScript (más seguro y nunca falla)
    const menuDisponible = menu.filter(item => {
      const stockRestante = item.cantidad_diaria - (item.vendidas_hoy || 0);
      return stockRestante > 0;
    });

    res.json({ menu: menuDisponible });
  } catch (err) {
    console.error('Error /api/menu error:', err);
    res.status(500).json({ error: 'Error cargando menú' });
  }
});

// POST /api/order → sin cambios, funciona perfecto
router.post('/order', async (req, res) => {
  try {
    const { itemId, cantidad = 1 } = req.body;
    const item = await MenuItem.findById(itemId);

    if (!item) return res.status(404).json({ mensaje: 'Producto no encontrado' });

    const disponible = item.cantidad_diaria - (item.vendidas_hoy || 0);
    if (disponible < cantidad) {
      return res.status(400).json({ 
        mensaje: `Solo quedan ${disponible} de ${item.nombre}` 
      });
    }

    item.vendidas_hoy = (item.vendidas_hoy || 0) + cantidad;
    await item.save();

    res.json({ 
      mensaje: `¡${cantidad} ${item.nombre} agregada${cantidad > 1 ? 's' : ''} al pedido!`,
      stock_restante: disponible - cantidad
    });
  } catch (err) {
    console.error('Error orden:', err);
    res.status(500).json({ mensaje: 'Error procesando orden' });
  }
});

export default router;