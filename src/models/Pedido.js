// src/models/Pedido.js - CÓDIGO FINAL CORREGIDO
import mongoose from 'mongoose';
import autoIncrement from 'mongoose-sequence';

// 1. Esquema para los ítems dentro del carrito
const itemPedidoSchema = new mongoose.Schema({
    itemId: { 
        type: mongoose.Schema.Types.ObjectId, 
        required: true 
    },
    // ❌ CAMPO 'numero_pedido' ELIMINADO DE AQUÍ ❌
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
    notas: { 
        type: String, 
        default: '' 
    }
}, { _id: false });

// Inicializamos el plugin de secuencia
const AutoIncrement = autoIncrement(mongoose);

// 2. Esquema Principal del Pedido
const pedidoSchema = new mongoose.Schema({
    // === Datos del Cliente ===
    telefonoCliente: {
        type: String,
        required: true,
        trim: true,
        index: true
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
        default: 3000
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
        default: 'default'
    }
}, { timestamps: true });

// 🛑 APLICAR EL PLUGIN AL ESQUEMA PRINCIPAL (AQUÍ ESTÁ CORRECTO)
pedidoSchema.plugin(AutoIncrement, {
    inc_field: 'numero_pedido', // Nombre del campo que será auto-incremental
    start_seq: 1000            // Número inicial (empezará en 1000, ajustado desde 100)
});

export default mongoose.model('Pedido', pedidoSchema);