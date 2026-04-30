// src/models/Restaurante.js
import mongoose from 'mongoose';

const restauranteSchema = new mongoose.Schema({
    nombre: { type: String, required: true },
    slug: { type: String, required: true, unique: true }, // ej: 'pizzeria-roma'
    whatsappPhoneId: { type: String, required: true, unique: true },
    whatsappToken: { type: String, required: true },
    whatsappVerifyToken: { type: String, required: true },
    activo: { type: Boolean, default: true },

    // 🌟 FASE 3: CONFIGURACIÓN OPERATIVA DINÁMICA
    configuracion: {
        ofreceDelivery: { type: Boolean, default: true },
        ofrecePickup: { type: Boolean, default: true },
        costoEnvioBase: { type: Number, default: 3000 }, // $30.00 en centavos
        directivasIA: { type: [String], default: [] } ,
        nombreBot: { type: String, default: "Mateo" },
        rolBot: { type: String, default: "Mesero" },
        ubicacionLocal: { type: String, default: "" }, // Dirección física para Pickup
        mensajeCerrado: { 
            type: String, 
            default: "Lo sentimos, estamos fuera de horario. ¡Vuelve pronto!" 
        }
    }
}, { timestamps: true });

export default mongoose.models.Restaurante || mongoose.model('Restaurante', restauranteSchema);