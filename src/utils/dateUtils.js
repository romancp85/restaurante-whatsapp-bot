// src/utils/dateUtils.js
import { DateTime } from "luxon"; // Si no tienes luxon: npm install luxon
import { normalizeText } from "../domains/semantic/utils/normalizeText.js";

export const verificarDisponibilidad = (restaurante) => {
  const { horarios, mensajeCerrado } = restaurante.configuracion;

  // 1. Obtener hora actual en la zona horaria del negocio
  // Es vital fijar la zona horaria para que no dependa del servidor (Heroku/AWS)
  const ahora = DateTime.now().setZone("America/Mexico_City");

  // Normalizamos el día de la semana para que coincida con tu DB (LUNES, MARTES...)
  const diasMapa = {
    1: "LUNES",
    2: "MARTES",
    3: "MIÉRCOLES",
    4: "JUEVES",
    5: "VIERNES",
    6: "SÁBADO",
    7: "DOMINGO",
  };
  const diaActual = diasMapa[ahora.weekday];
  const horaActualStr = ahora.toFormat("HH:mm");

  // 2. Buscar la configuración de hoy
  // Usamos normalize para ignorar tildes en la comparación por seguridad
  const configHoy = horarios.find(
    (h) => normalizeText(h.dia) === normalizeText(diaActual),
  );

  // 3. Validar si el día está activo
  if (!configHoy || !configHoy.activo) {
    return { abierto: false, mensaje: mensajeCerrado };
  }

  // 4. Comparar horas (Formato HH:mm)
  const { apertura, cierre } = configHoy;

  if (horaActualStr >= apertura && horaActualStr <= cierre) {
    return { abierto: true };
  }

  return { abierto: false, mensaje: mensajeCerrado };
};
