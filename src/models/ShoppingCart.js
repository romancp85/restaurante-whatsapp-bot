import mongoose from 'mongoose';

// Esquema de los ítems dentro del carrito
const itemSchema = new mongoose.Schema({
    itemId: { type: mongoose.Schema.Types.ObjectId, required: true },
    nombre: { type: String, required: true },
    precioUnitario: { type: Number, required: true }, // Precio en centavos
    cantidad: { type: Number, required: true, min: 1 },
    notas: { type: String, default: '' },
});

// Esquema Principal del Carrito
const shoppingCartSchema = new mongoose.Schema({
    clientPhone: {
        type: String,
        required: true,
        unique: true,
    },
    items: [itemSchema],
    default: [], // 🛡️ Esto asegura que .length NUNCA falle
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
            'ESPERANDO_AGENTE'
        ],
        default: 'INICIO'
    },
    // Objeto temporal para guardar IDs de menú o datos del checkout
    tempData: {
        type: Object,
        default: {}
    }
}, { 
    timestamps: true // Esto añade automáticamente 'createdAt' y 'updatedAt'
});


// ----------------------------------------------------
// 🛑 LÓGICA DE CADUCIDAD AUTOMÁTICA (TTL) 🛑
// ----------------------------------------------------

// Configuramos un índice TTL en el campo 'updatedAt'.
// 2 horas = 7200 segundos (60 segundos * 60 minutos * 2 horas).
// Si el cliente no interactúa con el carrito en media hora, MongoDB lo borrará.
shoppingCartSchema.index({ "updatedAt": 1 }, { expireAfterSeconds: 1800 }); 

// ----------------------------------------------------


const ShoppingCart = mongoose.model('ShoppingCart', shoppingCartSchema);

export default ShoppingCart;