// src/utils/formatter.js - 100% compatible con ES modules
import logger from "./logger.js";

logger.info("[Formatter] Cargador de formateadores iniciado...");

const formatPrice = (cents) => {
  return (cents / 100).toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
  });
};

const safeSend = async (fn, ...args) => {
  try {
    await fn(...args);
  } catch (error) {
    logger.error("[Formatter] Error en safeSend:", error);
  }
};

export { formatPrice, safeSend };
