// src/utils/logger.js

import winston from "winston";

const mexicoTime = () => {
  return new Date().toLocaleString("sv-SE", {
    timeZone: "America/Merida",
    hour12: false,
  });
};

/** */

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info", // Por si acaso no existe la variable

  format: winston.format.combine(
    winston.format.splat(), // 1. Agrega esto para que reconozca comas y placeholders (%O)
    winston.format.printf(({ level, message, ...meta }) => {
      // 2. Agrega ...meta aquí

      // 3. Si pasaste un objeto por coma, lo convertimos a texto legible
      const extra = Object.keys(meta).length
        ? `\n${JSON.stringify(meta, null, 2)}`
        : "";

      return `${mexicoTime()} [${level}]: ${message}${extra}`;
    }),
  ),

  transports: [new winston.transports.Console()],
});

export default logger;
