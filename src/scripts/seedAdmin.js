// src/scripts/seedAdmin.js
import 'dotenv/config';
import mongoose from 'mongoose';
import Usuario from '../models/Usuario.js';
import Restaurante from '../models/Restaurante.js';

const crearAdminInicial = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("📡 Conectado a MongoDB...");

        // 1. EL ID DE TU RESTAURANTE ACTUAL
        const businessId = "69ee826cc97786cd131eb3dd"; 

        // 2. Verificar si el restaurante existe
        const restaurante = await Restaurante.findById(businessId);
        if (!restaurante) {
            console.error("❌ Error: El Restaurante con ese ID no existe en la base de datos.");
            process.exit(1);
        }

        // 3. Datos del nuevo administrador
        const adminData = {
            nombre: "RCanche",
            email: "romancpl7@gmail.com", // 👈 ESTE SERÁ TU LOGIN
            password: "admin123",           // 👈 ESTA SERÁ TU CLAVE (se encriptará sola)
            businessId: businessId,
            rol: 'admin'
        };

        // 4. Verificar si el usuario ya existe para no duplicar
        const existe = await Usuario.findOne({ email: adminData.email });
        if (existe) {
            console.log("⚠️ El usuario ya existe. No se creó uno nuevo.");
        } else {
            const nuevoUsuario = new Usuario(adminData);
            await nuevoUsuario.save();
            console.log(`✅ Usuario creado con éxito para: ${restaurante.nombre}`);
            console.log(`📧 Email: ${adminData.email}`);
            console.log(`🔐 Password: ${adminData.password}`);
        }

        process.exit(0);
    } catch (error) {
        console.error("💥 Error fatal:", error);
        process.exit(1);
    }
};

crearAdminInicial();