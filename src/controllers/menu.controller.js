// src/controllers/menu.controller.js

import MenuItem from '../models/MenuItem.js'; // ⬅️ Subir a src/, luego a models/
import logger from '../utils/logger.js';     // ⬅️ Subir a src/, luego a utils/

/**
 * @desc Obtener todos los ítems del menú
 * @route GET /api/menu
 */
export const getAllMenuItems = async (req, res) => {
    try {
        const items = await MenuItem.find({}); 
        res.status(200).json(items);
    } catch (error) {
        logger.error('Error al obtener el menú:', error);
        res.status(500).json({ message: 'Error interno al obtener el menú.' });
    }
};

/**
 * @desc Crear un nuevo ítem en el menú
 * @route POST /api/menu
 */
export const createMenuItem = async (req, res) => {
    try {
        const newItem = new MenuItem(req.body);
        await newItem.save();
        res.status(201).json(newItem);
    } catch (error) {
        logger.error('Error al crear ítem:', error);
        res.status(400).json({ message: 'Datos inválidos para crear el ítem.' });
    }
};

/**
 * @desc Actualizar un ítem existente (por ID)
 * @route PUT /api/menu/:id
 */
export const updateMenuItem = async (req, res) => {
    const { id } = req.params;
    try {
        const updatedItem = await MenuItem.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });
        if (!updatedItem) {
            return res.status(404).json({ message: 'Ítem no encontrado.' });
        }
        res.status(200).json(updatedItem);
    } catch (error) {
        logger.error(`Error al actualizar ítem ${id}:`, error);
        res.status(400).json({ message: 'Error al actualizar el ítem.' });
    }
};

/**
 * @desc Eliminar un ítem del menú (por ID)
 * @route DELETE /api/menu/:id
 */
export const deleteMenuItem = async (req, res) => {
    const { id } = req.params;
    try {
        const deletedItem = await MenuItem.findByIdAndDelete(id);
        if (!deletedItem) {
            return res.status(404).json({ message: 'Ítem no encontrado.' });
        }
        res.status(200).json({ message: 'Ítem eliminado con éxito.' });
    } catch (error) {
        logger.error(`Error al eliminar ítem ${id}:`, error);
        res.status(500).json({ message: 'Error al eliminar el ítem.' });
    }
};