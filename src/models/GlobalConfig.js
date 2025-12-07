// src/models/GlobalConfig.js

import mongoose from 'mongoose';

const globalConfigSchema = new mongoose.Schema({
    clientId: {
        type: String,
        required: true,
        unique: true,
        default: 'GLOBAL_RESTAURANT' // ID único para el documento de configuración
    },
    // Estado de horarios de atención (ya debe existir)
    isBusinessOpen: {
        type: Boolean,
        default: true
    },
    // Mensaje a enviar si el negocio está cerrado (ya debe existir)
    closedMessage: {
        type: String,
        default: "Lo sentimos, estamos cerrados. Nuestro horario de atención es..."
    },
    // 🛑 NUEVO CAMPO: Costo de Envío 🛑
    costoEnvioCents: {
        type: Number,
        default: 3000, // $30.00 pesos/dólares en centavos (ejemplo)
        min: 0
    },
    // Campo para guardar la plantilla de datos de transferencia (ya debe existir)
    transferDetailsMessage: {
        type: String,
        default: "CLABE: 0123456789\nBanco: XYZ\nBeneficiario: Nombre de la Empresa"
    },
    // Métodos de pago aceptados (ya debe existir)
    acceptedPaymentMethods: {
        type: [String],
        default: ['Efectivo', 'Tarjeta', 'Transferencia']
    }
}, { timestamps: true });

export default mongoose.model('GlobalConfig', globalConfigSchema);