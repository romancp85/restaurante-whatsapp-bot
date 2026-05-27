// src/models/Restaurante.js
import mongoose from "mongoose";

const RestauranteSchema = new mongoose.Schema(
  {
    nombre: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    activo: { type: Boolean, default: true },

    // 🔐 Credenciales de WhatsApp
    whatsappPhoneId: { type: String, required: true },
    whatsappToken: { type: String, required: true },
    whatsappVerifyToken: { type: String, required: true },

    configuracion: {
      // 🧠 Inteligencia y Personalidad
      nombreBot: { type: String, default: "DZIRI" },
      rolBot: { type: String, default: "Asistente Virtual" },
      personalidad: { type: String, default: "amable y conciso" },
      directivasIA: [{ type: String }], // Array de strings que ya usas

      // 🛵 Logística de Entrega
      ofreceDelivery: { type: Boolean, default: true },
      ofrecePickup: { type: Boolean, default: true },
      costoEnvioBase: { type: Number, default: 3000 }, // centavos
      ubicacionLocal: { type: String },

      // ⏰ Horarios de Operación
      horarios: [
        {
          dia: {
            type: String,
            enum: [
              "LUNES",
              "MARTES",
              "MIÉRCOLES",
              "JUEVES",
              "VIERNES",
              "SÁBADO",
              "DOMINGO",
            ],
          },
          activo: { type: Boolean, default: true },
          apertura: { type: String, default: "09:00" },
          cierre: { type: String, default: "22:00" },
        },
      ],

      // 💬 Mensajería de Sistema
      mensajeCerrado: {
        type: String,
        default: "Lo sentimos, estamos fuera de horario de servicio.",
      },
      mensajeBienvenida: {
        type: String,
        default: "¡Bienvenido! ¿En qué puedo ayudarte hoy?",
      },
    },
  },
  { timestamps: true },
);

const Restaurante = mongoose.model("Restaurante", RestauranteSchema);
export default Restaurante;
