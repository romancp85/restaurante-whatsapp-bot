// src/models/ShoppingCart.js

import mongoose from 'mongoose';

// Esquema para los ítems dentro del carrito (similar al de Pedido, pero más simple)
const cartItemSchema = new mongoose.Schema({
    itemId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'MenuItem', // Referencia al modelo de Menú
        required: true 
    },
    nombre: { 
        type: String, 
        required: true 
    },
    precioUnitario: { 
        type: Number, 
        required: true, 
        min: 0 
    }, // Precio en centavos
    cantidad: { 
        type: Number, 
        required: true, 
        min: 1 
    },
    notas: { 
        type: String, 
        default: '' 
    }
}, { _id: false });

// Esquema Principal del Carrito
const shoppingCartSchema = new mongoose.Schema({
    // Identificador único para cada conversación de WhatsApp
    clientPhone: {
        type: String,
        required: true,
        unique: true, // Solo puede haber un carrito activo por cliente
        index: true
    },
    // Array de ítems
    items: [cartItemSchema],
    
    // Estado de la conversación (para saber dónde está el cliente en el flujo)
    conversationState: {
        type: String,
        enum: ['INICIO', 'MOSTRANDO_MENU', 'SELECCIONANDO_ITEM', 'PREGUNTANDO_CANTIDAD', 'EN_CARRITO', 'PREGUNTANDO_DIRECCION', 'CONFIRMANDO_PEDIDO'],
        default: 'INICIO'
    },
    
    // Almacena datos temporales (ej: el ID del ítem que acaba de seleccionar)
    tempData: {
        type: mongoose.Schema.Types.Mixed // Puede ser cualquier tipo de objeto
    },
    
    // Última actividad (para limpiar carritos inactivos)
    lastActivity: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });


export default mongoose.model('ShoppingCart', shoppingCartSchema);