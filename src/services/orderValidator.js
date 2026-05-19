// src/services/orderValidator.js
import MenuItem from "../models/MenuItem.js";
import logger from "../utils/logger.js";

/**
 * Valida los ítems extraídos por la IA contra el catálogo real de la DB.
 * Aplica Anclaje Semántico para resolver nombres con índices (ej: "1. Pizza")
 */
export const validarPedido = async (aiItems, businessId) => {
  try {
    if (!aiItems || !Array.isArray(aiItems))
      return { itemsValidados: [], extrasRechazados: [] };

    const itemsValidados = [];
    const extrasRechazados = [];

    // Traemos el menú y lo ordenamos por longitud de nombre (Descendente)
    // 💡 Truco Pro: Buscar primero los nombres más largos evita que "Pizza"
    // coincida erróneamente con "Pizza Pepperoni".
    const menuItems = await MenuItem.find({ businessId, activo: true })
      .lean()
      .sort({ nombre: -1 });

    for (const aiItem of aiItems) {
      //const notasSemanticas = [];
      let nombreIA = (aiItem.productName || "").toLowerCase().trim();
      if (!nombreIA) continue;

      // 🌟 1. LIMPIEZA DE ÍNDICE (Anclaje Semántico)
      // Quitamos el "1. " o "2 " del inicio si existe
      const nombreLimpio = nombreIA.replace(/^\d+[\s.]+\s*/, "").trim();

      // 🌟 2. BÚSQUEDA MULTI-NIVEL (Para máxima precisión)
      let productoReal = menuItems.find((p) => {
        const nombreDB = p.nombre.toLowerCase();

        // Nivel A: Match Exacto (ej: "coca-cola original" === "coca-cola original")
        if (nombreLimpio === nombreDB) return true;

        // Nivel B: Match por Inclusión (ej: "coca" está en "coca-cola original")
        if (
          nombreLimpio.length > 3 &&
          (nombreLimpio.includes(nombreDB) || nombreDB.includes(nombreLimpio))
        )
          return true;

        return false;
      });

      // 🌟 3. TRATAMIENTO DE PLURALES (Si falló la búsqueda inicial)
      if (!productoReal && nombreLimpio.endsWith("s")) {
        const nombreSingular = nombreLimpio.slice(0, -1);
        productoReal = menuItems.find((p) => {
          const nombreDB = p.nombre.toLowerCase();
          return (
            nombreSingular.length > 3 &&
            (nombreSingular.includes(nombreDB) ||
              nombreDB.includes(nombreSingular))
          );
        });
      }

      if (!productoReal) {
        logger.warn(`[Validator] Producto no encontrado: ${nombreIA}`);
        continue;
      }

      let precioExtraAcumulado = 0;

      const opcionesSeleccionadas = [];

      // =====================================================
      // NOTAS SEMÁNTICAS GLOBALES
      // =====================================================

      const notasSemanticas = [];

      // =====================================================
      // VALIDACIÓN DE MODIFICADORES
      // =====================================================

      if (aiItem.modifiers && Array.isArray(aiItem.modifiers)) {
        const modifiersSolicitados = [...aiItem.modifiers];

        const modifiersEncontrados = new Set();

        if (productoReal.modificadores?.length > 0) {
          for (const grupo of productoReal.modificadores) {
            const seleccionadosDelUsuario = modifiersSolicitados.filter(
              (modifier) => {
                const modifierValue = modifier.value?.toLowerCase?.() || "";

                return grupo.opciones.some((opt) =>
                  opt.nombre.toLowerCase().includes(modifierValue),
                );
              },
            );

            seleccionadosDelUsuario.forEach((modifier, index) => {
              const modifierValue = modifier.value?.toLowerCase?.() || "";

              const opcionDB = grupo.opciones.find((o) =>
                o.nombre.toLowerCase().includes(modifierValue),
              );

              if (!opcionDB) {
                return;
              }

              modifiersEncontrados.add(modifier.value);

              const esExcedente = index + 1 > grupo.maximo;

              if (esExcedente && !grupo.permiteExcedente) {
                return;
              }

              const costoAdicional = esExcedente
                ? opcionDB.precioAdicional || 0
                : 0;

              opcionesSeleccionadas.push({
                grupoNombre: grupo.nombre,
                opcionNombre: opcionDB.nombre,
                precioExtra: costoAdicional,
                semanticType: modifier.type,
              });

              precioExtraAcumulado += costoAdicional;
            });
          }
        }

        // =====================================================
        // MODIFIERS NO ESTRUCTURADOS
        // =====================================================

        const huerfanos = modifiersSolicitados.filter(
          (modifier) => !modifiersEncontrados.has(modifier.value),
        );

        if (huerfanos.length > 0) {
          extrasRechazados.push({
            producto: productoReal.nombre,
            extras: huerfanos,
          });
        }

        // =====================================================
        // CONVERTIR A NOTAS HUMANAS
        // =====================================================
        console.log("[Validator] Modifiers recibidos:", modifiersSolicitados);
        modifiersSolicitados.forEach((modifier) => {
          const value = modifier.value?.trim();

          if (!value) {
            return;
          }

          if (modifier.type === "REMOVE_INGREDIENT") {
            notasSemanticas.push(`Sin ${value}`);
          }

          if (modifier.type === "ADD_INGREDIENT") {
            notasSemanticas.push(`Con ${value}`);
          }

          if (modifier.type === "EXTRA_INGREDIENT") {
            notasSemanticas.push(`Extra ${value}`);
          }
        });
      }

      const precioUnitarioFinal =
        productoReal.precioBase + precioExtraAcumulado;
      const cantidad = parseInt(aiItem.quantity) || 1;
      const notasExistentes = aiItem.notes || "";

      const notasIA = notasSemanticas.join(", ");

      const notasItem = [notasExistentes, notasIA].filter(Boolean).join(" | ");

      console.log("[Validator] Notas finales:", notasItem);

      // Agrupamiento en el carrito (Mismo ID + Mismos Extras + Mismas Notas)
      const itemExistenteIdx = itemsValidados.findIndex(
        (v) =>
          v.itemId.toString() === productoReal._id.toString() &&
          JSON.stringify(v.opcionesSeleccionadas) ===
            JSON.stringify(opcionesSeleccionadas) &&
          v.notas === notasItem,
      );

      if (itemExistenteIdx > -1) {
        itemsValidados[itemExistenteIdx].quantity += cantidad;
      } else {
        itemsValidados.push({
          itemId: productoReal._id,
          nombre: productoReal.nombre,
          precioUnitario: precioUnitarioFinal,
          quantity: cantidad,
          opcionesSeleccionadas,
          notas: notasItem,
        });
      }
    }

    return { itemsValidados, extrasRechazados };
  } catch (error) {
    logger.error("Error crítico en validarPedido:", error);
    return { itemsValidados: [], extrasRechazados: [] };
  }
};

/**
 * Calcula los totales financieros finales
 */
export const calcularTotalesFinales = (items, deliveryMode, restaurante) => {
  const subtotal = items.reduce((acc, item) => {
    const qty = item.cantidad || item.quantity || 0;
    const precio = item.precioUnitario || 0;
    return acc + precio * qty;
  }, 0);

  const esPickup = deliveryMode === "PICKUP";
  // Leemos el costo de la configuración dinámica del restaurante
  const costoEnvioBase = restaurante.configuracion?.costoEnvioBase || 3000;
  const costoEnvioFinal = esPickup ? 0 : costoEnvioBase;

  return {
    subtotal,
    envio: costoEnvioFinal,
    total: subtotal + costoEnvioFinal,
    esPickup: esPickup,
  };
};
