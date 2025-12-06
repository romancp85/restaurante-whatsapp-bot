// src/models/Configuracion.js
import mongoose from 'mongoose';

// Esquema para un turno (ej. 13:00 a 16:00)
const turnoSchema = new mongoose.Schema({
    apertura: {
        type: String,
        required: true,
        match: /^\d{2}:\d{2}$/ // Garantiza formato HH:MM
    },
    cierre: {
        type: String,
        required: true,
        match: /^\d{2}:\d{2}$/ // Garantiza formato HH:MM
    }
}, { _id: false });

// Esquema para un día de operación
const diaOperacionSchema = new mongoose.Schema({
    dia: {
        type: String,
        required: true,
        enum: ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO']
    },
    activo: {
        type: Boolean,
        default: true
    },
    turnos: [turnoSchema]
}, { _id: false });

// Esquema principal: contendrá solo un documento
const configuracionSchema = new mongoose.Schema({
    nombre: {
        type: String,
        required: true,
        default: 'horarios_operacion',
        unique: true
    },
    dias_operacion: [diaOperacionSchema],
    mensaje_cerrado: {
        type: String,
        default: "¡Hola! Nuestro horario de atención es limitado. Por favor, revisa nuestros horarios en la sección de información."
    }
}, { timestamps: true });

export default mongoose.model('Configuracions', configuracionSchema);