// src/scripts/seedAdmin.js
import "dotenv/config";
import mongoose from "mongoose";
import Usuario from "../models/Usuario.js";
import Restaurante from "../models/Restaurante.js";
import { logger } from "../utils/logger.js";

const crearAdminInicial = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    logger.info("[SeedAdmin]📡 Conectado a MongoDB...");

    // 1. EL ID DE TU RESTAURANTE ACTUAL
    const businessId = "69ee826cc97786cd131eb3dd";

    // 2. Verificar si el restaurante existe
    const restaurante = await Restaurante.findById(businessId);
    if (!restaurante) {
      logger.error(
        "[SeedAdmin]❌ Error: El Restaurante con ese ID no existe en la base de datos.",
      );
      process.exit(1);
    }

    // 3. Datos del nuevo administrador
    const adminData = {
      nombre: "RCanche",
      email: "romancpl7@gmail.com", // 👈 ESTE SERÁ TU LOGIN
      password: "admin123", // 👈 ESTA SERÁ TU CLAVE (se encriptará sola)
      businessId: businessId,
      rol: "admin",
    };

    // 4. Verificar si el usuario ya existe para no duplicar
    const existe = await Usuario.findOne({ email: adminData.email });
    if (existe) {
      logger.info(`[SeedAdmin]⚠️ El usuario ya existe. No se creó uno nuevo.`);
    } else {
      const nuevoUsuario = new Usuario(adminData);
      await nuevoUsuario.save();
      logger.info(
        `[SeedAdmin]✅ Usuario creado con éxito para: ${restaurante.nombre}`,
      );
      logger.info(`[SeedAdmin]📧 Email: ${adminData.email}`);
      logger.info(`[SeedAdmin]🔐 Password: ${adminData.password}`);
    }

    process.exit(0);
  } catch (error) {
    logger.error("[SeedAdmin]💥 Error fatal:", error);
    process.exit(1);
  }
};

crearAdminInicial();
