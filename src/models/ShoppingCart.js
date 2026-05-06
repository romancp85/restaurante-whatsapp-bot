// src/models/ShoppingCart.js - VERSIÓN FINAL ENTERPRISE

import mongoose from 'mongoose';

// 1. Esquema de los ítems internos
const itemSchema = new mongoose.Schema({
    itemId: { type: mongoose.Schema.Types.ObjectId, required: true },
    nombre: { type: String, required: true },
    precioUnitario: { type: Number, required: true }, // Centavos
    cantidad: { type: Number, required: true, min: 1 },
    opcionesSeleccionadas: [{
        grupoNombre: String,
        opcionNombre: String,
        precioExtra: { type: Number, default: 0 } // Centavos
    }],
    notas: { type: String, default: '' }, // Notas para la cocina
});

// 2. Definición del Esquema Principal
const shoppingCartSchema = new mongoose.Schema({
    whatsappId: { // Antes clientPhone - Estandarizado para Meta
        type: String,
        required: true,
    },
    businessId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Restaurante', 
        required: true 
    },
    items: [itemSchema],
    totalCents: { // 🌟 CRÍTICO: El valor total actual del carrito en centavos
        type: Number,
        default: 0
    },
    conversationState: {
        type: String,
        enum: [
            'INICIO',
            'MOSTRANDO_MENU',
            'PREGUNTANDO_NOMBRE',
            'PREGUNTANDO_DIRECCION',
            'PREGUNTANDO_PAGO',
            'CONFIRMANDO_PEDIDO',
            'ESPERANDO_AGENTE',
            'PREGUNTANDO_MODO_ENTREGA',
            'WAITING_FOR_REMOVAL'
        ],
        default: 'INICIO'
    },
    tempData: {
        // Almacena history (IA), menuMap, lastProductDiscussed, deliveryMode, etc.
        type: Object,
        default: { history: [], menuMap: [] }
    }
}, { 
    timestamps: true 
});

// 3. Índices (Blindaje Multi-tenant y Performance)

// Índice compuesto: Un usuario solo tiene UN carrito por restaurante
shoppingCartSchema.index({ whatsappId: 1, businessId: 1 }, { unique: true });

// Índice TTL: El carrito se autodestruye tras 30 minutos de inactividad
// (Ideal para SaaS: mantiene la DB limpia y evita carritos "zombies")
shoppingCartSchema.index({ "updatedAt": 1 }, { expireAfterSeconds: 1800 }); 

const ShoppingCart = mongoose.model('ShoppingCart', shoppingCartSchema);
export default ShoppingCart;