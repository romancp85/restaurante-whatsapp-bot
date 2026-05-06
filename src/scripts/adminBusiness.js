// src/scripts/adminBusiness.js
import 'dotenv/config';
import mongoose from 'mongoose';
import Restaurante from '../models/Restaurante.js';
import { encrypt } from '../utils/cryptoUtils.js';
import logger from '../utils/logger.js';

const registrarNegocio = async (nombre, phoneId, rawToken) => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        // 🛡️ CIFRAMOS EL TOKEN ANTES DE GUARDAR
        const tokenCifrado = encrypt(rawToken);

        const nuevoNegocio = await Restaurante.findOneAndUpdate(
            { whatsappPhoneId: phoneId },
            { 
                nombre, 
                whatsappToken: tokenCifrado, // Se guarda como "iv:hash"
                activo: true 
            },
            { upsert: true, new: true }
        );

        console.log(`✅ Negocio "${nombre}" actualizado con éxito.`);
        console.log(`🔐 Token cifrado guardado en DB.`);
        process.exit(0);
    } catch (error) {
        console.error("❌ Error:", error);
        process.exit(1);
    }
};

// Ejemplo de uso desde la terminal:
// node src/scripts/adminBusiness.js "Hamburguesas RISA" "1092168580637791" "EAAVZ..."
const [,, nombre, id, token] = process.argv;
if (nombre && id && token) {
    registrarNegocio(nombre, id, token);
} else {
    console.log("Uso: node src/scripts/adminBusiness.js 'Nombre' 'PhoneID' 'Token'");
}