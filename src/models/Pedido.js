// src/models/Pedido.js
// FIX: Se agrega índice compuesto { businessId, estado } para la consulta
// más frecuente del sistema (listar pedidos activos del dashboard).
// Sin este índice MongoDB hace un collection scan completo cada vez.
//
// FIX MENOR: Se elimina la definición duplicada de clienteId que existía
// en el schema original (estaba declarado dos veces, el segundo sobreescribía).
import mongoose from 'mongoose';
import autoIncrement from 'mongoose-sequence';

const { Schema } = mongoose;

const opcionSeleccionadaSchema = new Schema({
    grupoNombre: String,
    opcionNombre: String,
    precioExtra: { type: Number, default: 0 },
}, { _id: false });

const itemPedidoSchema = new Schema({
    itemId: { type: Schema.Types.ObjectId, ref: 'MenuItem', required: true },
    nombre: { type: String, required: true },
    precioUnitario: { type: Number, required: true, min: 0 },
    cantidad: { type: Number, required: true, min: 1 },
    opcionesSeleccionadas: [opcionSeleccionadaSchema],
    notas: { type: String, default: '' },
}, { _id: false });

const AutoIncrement = autoIncrement(mongoose);

const pedidoSchema = new Schema({
    telefonoCliente: { type: String, required: true, trim: true },
    nombreCliente: { type: String, required: true, trim: true },
    direccionEntrega: { type: String, required: true },
    clienteId: { type: String, required: true },
    comentarios: { type: String, default: '' },
    items: [itemPedidoSchema],
    subtotal: { type: Number, required: true, min: 0 },
    costoEnvio: { type: Number, required: true, default: 0 },
    total: { type: Number, required: true, min: 0 },
    metodoPago: { type: String, default: 'Efectivo' },
    entregaMode: {
        type: String,
        enum: ['DELIVERY', 'PICKUP'],
        default: 'DELIVERY',
    },
    estado: {
        type: String,
        enum: ['Pendiente', 'Confirmado', 'En Preparación', 'En Camino', 'Entregado', 'Cancelado'],
        default: 'Pendiente',
        index: true,
    },
    businessId: {
        type: Schema.Types.ObjectId,
        ref: 'Restaurante',
        required: true,
        index: true,
    },
    source: {
        type: String,
        enum: ['WHATSAPP', 'DIRECTO', 'WEB'],
        default: 'WHATSAPP',
    },
}, { timestamps: true });

// FIX: Índice compuesto para la consulta principal del Dashboard.
// Cubre: Pedido.find({ businessId, estado: { $in: [...] } }).sort({ createdAt: -1 })
// Sin este índice: O(n) scan. Con este índice: O(log n) lookup.
pedidoSchema.index({ businessId: 1, estado: 1, createdAt: -1 });

// Índice para búsqueda por teléfono (historial de cliente)
pedidoSchema.index({ telefonoCliente: 1, businessId: 1 });

pedidoSchema.plugin(AutoIncrement, {
    inc_field: 'numero_pedido',
    start_seq: 1000,
});

export default mongoose.model('Pedido', pedidoSchema);
