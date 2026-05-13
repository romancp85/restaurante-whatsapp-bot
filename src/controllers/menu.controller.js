// src/controllers/menu.controller.js
// Mantiene los nombres de exportación originales para no romper menu.routes.js:
//   - getMenuByBusiness
//   - upsertMenuItem
//   - deleteMenuItem
//
// Mejoras sobre la versión original:
//   - Invalida caché Redis al guardar/borrar
//   - Soft-delete (desactiva en vez de borrar, preserva historial de pedidos)
//   - Acepta precio en centavos (precioBase) o en pesos (precio)
//   - Errores descriptivos
import MenuItem from '../models/MenuItem.js';
import { invalidateMenuCache } from '../services/menuService.js';
import logger from '../utils/logger.js';

/**
 * GET /api/menu
 * Lista todos los productos del negocio autenticado.
 * ?filter=TODOS incluye inactivos (para el panel de admin).
 */
export const getMenuByBusiness = async (req, res) => {
    try {
        const businessId = req.businessId;
        const { filter } = req.query;

        const query = { businessId };
        if (filter !== 'TODOS') query.activo = true;

        const items = await MenuItem.find(query).sort({ categoria: 1, nombre: 1 }).lean();
        res.json(items);
    } catch (error) {
        logger.error('[Menu] Error al obtener menú:', error.message);
        res.status(500).json({ message: 'Error al obtener el menú.' });
    }
};

/**
 * POST /api/menu
 * Crea o actualiza un producto según si viene `id` en el body (patrón original).
 */
export const upsertMenuItem = async (req, res) => {
    try {
        const businessId = req.businessId;
        const {
            id, nombre,
            precioBase, precio,     // acepta ambos nombres
            categoria, descripcion,
            disponible, activo,
            cantidad_diaria, alerta_en,
            tipoProducto, modificadores, diasDisponibles,
        } = req.body;

        if (!nombre) {
            return res.status(400).json({ message: 'El nombre del producto es requerido.' });
        }

        // Normaliza precio: acepta centavos (precioBase) o pesos con decimales (precio)
        const precioFinal = precioBase
            ? Math.round(parseFloat(precioBase))
            : Math.round(parseFloat(precio || 0) * 100);

        if (!precioFinal || precioFinal <= 0) {
            return res.status(400).json({ message: 'El precio debe ser mayor a cero.' });
        }

        const data = {
            businessId,
            nombre: nombre.trim(),
            precioBase: precioFinal,
            categoria: (categoria || 'GENERAL').trim().toUpperCase(),
            descripcion: (descripcion || '').trim(),
            disponible: disponible !== undefined ? disponible : true,
            activo: activo !== undefined ? activo : true,
            cantidad_diaria: parseInt(cantidad_diaria) || 99,
            alerta_en: parseInt(alerta_en) || 5,
            tipoProducto: tipoProducto || 'simple',
            modificadores: modificadores || [],
            diasDisponibles: diasDisponibles || [0, 1, 2, 3, 4, 5, 6],
        };

        let resultado;
        if (id) {
            resultado = await MenuItem.findOneAndUpdate(
                { _id: id, businessId },
                data,
                { new: true }
            );
            if (!resultado) return res.status(404).json({ message: 'Producto no encontrado.' });
        } else {
            resultado = new MenuItem(data);
            await resultado.save();
        }

        await invalidateMenuCache(businessId);
        res.status(id ? 200 : 201).json(resultado);
    } catch (error) {
        logger.error('[Menu] Error en upsertMenuItem:', error.message);
        res.status(400).json({ message: 'Error al guardar el producto.', detail: error.message });
    }
};

/**
 * DELETE /api/menu/:id
 * Soft-delete: marca activo=false para preservar historial de pedidos.
 */
export const deleteMenuItem = async (req, res) => {
    try {
        const businessId = req.businessId;
        const { id } = req.params;

        const item = await MenuItem.findOne({ _id: id, businessId });
        if (!item) return res.status(404).json({ message: 'Producto no encontrado.' });

        item.activo = false;
        item.disponible = false;
        await item.save();

        await invalidateMenuCache(businessId);
        res.json({ message: 'Producto desactivado correctamente.' });
    } catch (error) {
        logger.error('[Menu] Error en deleteMenuItem:', error.message);
        res.status(500).json({ message: 'Error al eliminar el producto.' });
    }
};
