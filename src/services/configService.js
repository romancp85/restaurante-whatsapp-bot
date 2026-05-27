// src/services/configService.js - VERSIÓN FINAL PARA PANEL DE ADMIN

import Configuracion from "../models/Configuracion.js";
import logger from "../utils/logger.js";

logger.info("[Config]--- ✅ MÓDULO configService.js CARGADO ---");

const CONFIG_CACHE = new Map();
const TTL = 60000; // 60 segundos (1 minuto)

const DEFAULT_DELIVERY_COST = 3000; // $30.00 en centavos como fallback de emergencia

/**
 * Función genérica para obtener la configuración desde la base de datos con caché.
 * @param {string} configName - Nombre del documento de configuración (ej: 'horarios_operacion').
 */
export const getConfigFromDB = async (configName) => {
  // ⬅️ AÑADIMOS EXPORT CONST
  const key = `config_${configName}`;
  const cached = CONFIG_CACHE.get(key);

  if (cached && Date.now() - cached.timestamp < TTL) {
    return cached.data;
  }

  try {
    // Usamos el modelo Configuracion que has definido
    const config = await Configuracion.findOne({ nombre: configName }).lean();
    const data = config || {};
    CONFIG_CACHE.set(key, { data: data, timestamp: Date.now() });
    return data;
  } catch (error) {
    logger.error(
      `[Config] Error cargando configuración (${configName}):`,
      error.message,
    );
    return {};
  }
};

/**
 * Verifica si el negocio está abierto en la hora actual del servidor.
 */
export const isBusinessOpen = async () => {
  const config = await getConfigFromDB("horarios_operacion"); // Usamos la nueva función

  if (!config || !config.dias_operacion || config.dias_operacion.length === 0) {
    // Si no hay configuración, asumimos abierto o usamos el mensaje cerrado por defecto
    return { open: true, message: "Estamos temporalmente cerrados, disculpa." };
  }

  // ... (Tu lógica de horarios existente sin cambios) ...
  const now = new Date();
  const currentDayIndex = now.getDay();
  const dayNames = [
    "DOMINGO",
    "LUNES",
    "MARTES",
    "MIÉRCOLES",
    "JUEVES",
    "VIERNES",
    "SÁBADO",
  ];
  const currentDayName = dayNames[currentDayIndex];
  const currentTime = now.getHours() * 60 + now.getMinutes();

  const todayConfig = config.dias_operacion.find(
    (d) => d.dia === currentDayName,
  );

  if (!todayConfig || !todayConfig.activo) {
    // Usamos el campo 'mensaje_cerrado' del documento 'horarios_operacion'
    return { open: false, message: config.mensaje_cerrado };
  }

  // DEBUGGING CRÍTICO
  logger.info(
    `[DEBUG HORARIO] Día: ${currentDayName}, Hora actual (minutos): ${currentTime}`,
  );

  for (const turno of todayConfig.turnos) {
    const [openHour, openMinute] = turno.apertura.split(":").map(Number);
    const [closeHour, closeMinute] = turno.cierre.split(":").map(Number);

    const openTime = openHour * 60 + openMinute;
    const closeTime = closeHour * 60 + closeMinute;

    logger.info(
      `[DEBUG HORARIO] Turno ${turno.apertura}-${turno.cierre}: Open=${openTime}, Close=${closeTime}`,
    );

    // Condición de apertura
    if (currentTime >= openTime && currentTime <= closeTime) {
      logger.info(`[DEBUG HORARIO] COINCIDENCIA ENCONTRADA. Abierto.`);
      return { open: true };
    }
  }

  logger.info(`[DEBUG HORARIO] Ningún turno coincide. Cerrado.`);

  return { open: false, message: config.mensaje_cerrado };
};

/**
 * @desc Obtiene el costo de envío de la configuración global.
 * @returns {Number} Costo de envío en centavos (o el valor de fallback si falla).
 */
export const getDeliveryCost = async () => {
  try {
    // 🛑 ASUMIMOS QUE HAY UN DOCUMENTO EN LA DB LLAMADO 'costos_globales' 🛑
    const config = await getConfigFromDB("costos_globales");

    // ASUMIMOS QUE EL CAMPO SE LLAMA 'costo_envio'
    const cost = config.datos?.costo_envio;

    // Verificamos que sea un número válido
    if (typeof cost === "number" && cost >= 0) {
      logger.info(`[Delivery]Costo de envío leído desde DB: $${cost / 100}`);
      return cost;
    }

    logger.warn(
      `[Delivery]Costo de envío no encontrado en DB. Usando fallback: $${DEFAULT_DELIVERY_COST / 100}`,
    );
    return DEFAULT_DELIVERY_COST;
  } catch (error) {
    logger.error(
      `[Delivery] Error crítico al leer costos. Usando fallback.`,
      error,
    );
    return DEFAULT_DELIVERY_COST;
  }
};
