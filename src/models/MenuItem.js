// src/models/MenuItem.js
import mongoose from 'mongoose';

// 1. Esquema para opciones individuales (ej: "Extra Queso", "Pastor")
const opcionSchema = new mongoose.Schema({
    nombre: { type: String, required: true },
    precioAdicional: { type: Number, default: 0 }, // En centavos
    disponible: { type: Boolean, default: true }
}, { _id: true });

// 2. Esquema para grupos de modificadores (Jerarquía Universal)
const grupoModificadoresSchema = new mongoose.Schema({
    nombre: { type: String, required: true }, // Ej: "Escoge tu carne", "Ingredientes Extra"
    
    // REGLAS DE ORO DEL COMANDEO (Punto 1 y 3 del Roadmap)
    minimo: { type: Number, default: 0 }, // 1 si es obligatorio (Ej: Tacos/Tamales)
    maximo: { type: Number, default: 1 }, // Límite de lo incluido o permitido
    
    // ¿Qué pasa si el cliente pide más del máximo?
    permiteExcedente: { type: Boolean, default: false }, 
    // true: Se cobran como extras. false: Mateo dice "No se puede".

    opciones: [opcionSchema]
}, { _id: true });

// 3. Esquema Principal de Producto
const menuSchema = new mongoose.Schema({
    businessId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Restaurante', 
        required: true, 
        index: true 
    },
    nombre: { type: String, required: true, trim: true },
    descripcion: { type: String }, 
    precioBase: { type: Number, required: true, min: 0 }, // Precio inicial (en centavos)
    categoria: { type: String, default: 'general', index: true },
    
    // PILAR 1: ATRIBUTOS DINÁMICOS
    tipoProducto: { 
        type: String, 
        enum: ['simple', 'con_variantes', 'compuesto'], 
        default: 'simple' 
    },
    modificadores: [grupoModificadoresSchema],

    // PILAR 2: LÓGICA TEMPORAL (Disponibilidad por día)
    diasDisponibles: { 
        type: [Number], 
        default: [0, 1, 2, 3, 4, 5, 6] 
    },

    // Stock y Control (Punto 4 del Roadmap)
    disponible: { type: Boolean, default: true },
    cantidad_diaria: { type: Number, default: 99 },
    vendidas_hoy: { type: Number, default: 0 },
    
    // 🌟 NUEVO CAMPO: Umbral para avisar al dueño que el producto se va a agotar
    alerta_en: { type: Number, default: 5 }, 
    
    activo: { type: Boolean, default: true }
}, { timestamps: true });

// Evitar errores de re-compilación de modelos en desarrollo
export default mongoose.models.MenuItem || mongoose.model('MenuItem', menuSchema);