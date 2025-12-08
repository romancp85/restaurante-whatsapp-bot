import mongoose from 'mongoose';

const menuSchema = new mongoose.Schema({
    nombre: {
        type: String,
        required: true,
        trim: true
    },
    precio: {
        type: Number,
        required: true,
        min: 0
    },
    categoria: {
        type: String,
        default: 'general'
    },
    
    // Campo critico para Especiales del Dia
    disponible: { 
        type: Boolean, 
        default: true 
    },

    // Stock
    cantidad_diaria: { type: Number, default: 10 },
    vendidas_hoy:    { type: Number, default: 0 },
    alerta_en:       { type: Number, default: 7 },
    activo:          { type: Boolean, default: true },
    fecha_reset:     { type: Date, default: Date.now }
});

// Patron seguro de exportacion
export default mongoose.models.MenuItem || mongoose.model('MenuItem', menuSchema);