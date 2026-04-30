// src/models/Pedido.js
import mongoose from 'mongoose';
import autoIncrement from 'mongoose-sequence';

const { Schema } = mongoose;

// 1. Esquema para los modificadores (Extras)
const opcionSeleccionadaSchema = new Schema({
    grupoNombre: String,
    opcionNombre: String,
    precioExtra: { type: Number, default: 0 } // En centavos
}, { _id: false });

// 2. Esquema para los ítems dentro del pedido
const itemPedidoSchema = new Schema({
    itemId: { 
        type: Schema.Types.ObjectId, 
        ref: 'MenuItem',
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
    },
    cantidad: { 
        type: Number, 
        required: true, 
        min: 1 
    },
    opcionesSeleccionadas: [opcionSeleccionadaSchema],
    notas: { 
        type: String, 
        default: '' 
    }
}, { _id: false });

// Inicializamos el plugin de secuencia
const AutoIncrement = autoIncrement(mongoose);

// 3. Esquema Principal del Pedido
const pedidoSchema = new Schema({
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
    clienteId: {
        type: String,
        required: true
    },
    
    // === 🌟 NOTAS GLOBALES (EL CAMBIO CLAVE) ===
    // Aquí es donde se guardará "billete de 500", "el timbre no sirve", etc.
    comentarios: { 
        type: String, 
        default: "" 
    },
    
    // === Contenido del Pedido ===
    items: [itemPedidoSchema],
    
    // === Financiero (En centavos) ===
    subtotal: {
        type: Number,
        required: true,
        min: 0 
    },
    costoEnvio: {
        type: Number,
        required: true,
        default: 0
    },
    total: {
        type: Number,
        required: true,
        min: 0
    },
    
    // === Operación y Estado ===
    metodoPago: {
        type: String,
        default: 'Efectivo'
    },
    entregaMode: {
        type: String,
        enum: ['DELIVERY', 'PICKUP'],
        default: 'DELIVERY'
    },
    estado: {
        type: String,
        enum: ['Pendiente', 'Confirmado', 'En Preparación', 'En Camino', 'Entregado', 'Cancelado'],
        default: 'Pendiente'
    },
    businessId: { 
        type: Schema.Types.ObjectId, 
        ref: 'Restaurante', 
        required: true, 
        index: true 
    }
}, { timestamps: true });

// APLICAR EL PLUGIN DE AUTO-INCREMENTO
pedidoSchema.plugin(AutoIncrement, {
    inc_field: 'numero_pedido', 
    start_seq: 1000            
});

export default mongoose.model('Pedido', pedidoSchema);