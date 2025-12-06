// src/models/GlobalConfig.js

import mongoose from 'mongoose';

const GlobalConfigSchema = new mongoose.Schema({
    // Usamos un identificador fijo para asegurar que solo haya un documento de configuración
    // (Ej: 'MAIN_CONFIG', 'RESTAURANT_1', etc.)
    clientId: {
        type: String,
        required: true,
        unique: true,
        default: 'GLOBAL_RESTAURANT'
    },
    
    // Lista de métodos de pago aceptados por el restaurante
    acceptedPaymentMethods: {
        type: [String], // Array de strings
        default: ['Efectivo', 'Transferencia'],
        // Enum opcional para forzar la validación en la DB
        enum: ['Efectivo', 'Transferencia', 'Tarjeta']
    },
    
    // Mensaje que se envía al cliente cuando está cerrado
    closedMessage: {
        type: String,
        default: "¡Hola! Nuestro horario de atención es limitado. Estamos cerrados ahora mismo."
    },

    // Aquí puedes añadir variables sensibles del .env para control administrativo
    // Ejemplo: Whatsapp Phone ID, etc.

}, { timestamps: true });

export default mongoose.model('GlobalConfig', GlobalConfigSchema);