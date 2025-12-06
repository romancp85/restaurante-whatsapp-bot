// src/models/Pedido.js
import mongoose from 'mongoose';

// 1. Esquema para los ítems dentro del carrito
const itemPedidoSchema = new mongoose.Schema({
    itemId: { 
        type: mongoose.Schema.Types.ObjectId, 
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
    }, // Precio en centavos al momento de la compra
    cantidad: { 
        type: Number, 
        required: true, 
        min: 1 
    },
    // Opcional: para pedidos complejos (ej. sin cebolla, extra queso)
    notas: { 
        type: String, 
        default: '' 
    }
}, { _id: false }); // No necesitamos un ID de MongoDB para cada sub-documento

// 2. Esquema Principal del Pedido
const pedidoSchema = new mongoose.Schema({
    // === Datos del Cliente (Recopilados en la sesión) ===
    telefonoCliente: {
        type: String,
        required: true,
        trim: true,
        index: true // Útil para búsquedas rápidas por teléfono
    },
    nombreCliente: {
        type: String,
        required: true,
        trim: true
    },
    direccionEntrega: {
        type: String,
        required: true
    },
    
    // === Contenido del Pedido ===
    items: [itemPedidoSchema],
    
    // === Financiero ===
    subtotal: {
        type: Number,
        required: true,
        min: 0 
    },
    costoEnvio: {
        type: Number,
        required: true,
        default: 3000 // Ej: $30.00 MXN en centavos
    },
    total: {
        type: Number,
        required: true,
        min: 0
    },
    
    // === Operación y Estado ===
    metodoPago: {
        type: String,
        enum: ['Efectivo', 'Transferencia', 'Tarjeta'],
        default: 'Efectivo'
    },
    estado: {
        type: String,
        enum: ['Pendiente', 'Confirmado', 'En Preparación', 'En Camino', 'Entregado', 'Cancelado'],
        default: 'Pendiente'
    },
    
    // === Metadatos ===
    clienteId: {
        type: String,
        default: 'default' // Para soportar múltiples restaurantes en el futuro
    }
}, { timestamps: true }); // Mongoose añade createdAt y updatedAt automáticamente

export default mongoose.model('Pedido', pedidoSchema);