import mongoose from 'mongoose';

// 1. Esquema de los ítems internos
const itemSchema = new mongoose.Schema({
    itemId: { type: mongoose.Schema.Types.ObjectId, required: true },
    nombre: { type: String, required: true },
    precioUnitario: { type: Number, required: true },
    cantidad: { type: Number, required: true, min: 1 },
    opcionesSeleccionadas: [{
        grupoNombre: String,
        opcionNombre: String,
        precioExtra: Number
    }],
    notas: { type: String, default: '' },
});

// 2. Definición del Esquema Principal (DEBE IR ANTES DE LOS ÍNDICES)
const shoppingCartSchema = new mongoose.Schema({
    clientPhone: {
        type: String,
        required: true,
    },
    businessId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Restaurante', 
        required: true 
    },
    items: [itemSchema],
    conversationState: {
        type: String,
        enum: [
            'INICIO',
            'EMPEZAR',
            'MOSTRANDO_MENU',
            'PREGUNTANDO_CANTIDAD',
            'EN_CARRITO',
            'PREGUNTANDO_NOMBRE',
            'PREGUNTANDO_DIRECCION',
            'PREGUNTANDO_PAGO',
            'CONFIRMANDO_PEDIDO',
            'ESPERANDO_AGENTE',
            'PREGUNTANDO_MODO_ENTREGA',
            'WAITING_FOR_REMOVAL' // 🌟 AÑADIR ESTO 🌟
        ],
        default: 'INICIO'
    },
    tempData: {
        type: Object,
        default: {}
    }
}, { 
    timestamps: true 
});

// 3. AHORA SÍ: Definición de Índices
// Índice compuesto para Multi-tenant
shoppingCartSchema.index({ clientPhone: 1, businessId: 1 }, { unique: true });

// Índice TTL para limpieza automática (30 minutos)
shoppingCartSchema.index({ "updatedAt": 1 }, { expireAfterSeconds: 1800 }); 

// 4. Exportación
const ShoppingCart = mongoose.model('ShoppingCart', shoppingCartSchema);
export default ShoppingCart;