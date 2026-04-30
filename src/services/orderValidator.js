// src/services/orderValidator.js
import MenuItem from '../models/MenuItem.js';
import logger from '../utils/logger.js';

export const validarPedido = async (aiItems, businessId) => {
    try {
        if (!aiItems || !Array.isArray(aiItems)) return [];
        const itemsValidados = [];
        const menuItems = await MenuItem.find({ businessId, activo: true }).lean();

        for (const aiItem of aiItems) {
            const nombreBusqueda = (aiItem.productName || "").toLowerCase();
            if (!nombreBusqueda) continue;

            const productoReal = menuItems.find(p => 
                nombreBusqueda.includes(p.nombre.toLowerCase()) ||
                p.nombre.toLowerCase().includes(nombreBusqueda)
            );

            if (!productoReal) continue;

            let precioExtraAcumulado = 0;
            const opcionesSeleccionadas = [];

            if (aiItem.modifiers && Array.isArray(aiItem.modifiers) && productoReal.modificadores?.length > 0) {
                for (const grupo of productoReal.modificadores) {
                    const seleccionadosDelUsuario = aiItem.modifiers.filter(m => 
                        grupo.opciones.some(opt => opt.nombre.toLowerCase().includes(m.toLowerCase()))
                    );

                    seleccionadosDelUsuario.forEach((modNombre, index) => {
                        const opcionDB = grupo.opciones.find(o => 
                            o.nombre.toLowerCase().includes(modNombre.toLowerCase())
                        );

                        if (opcionDB) {
                            const esExcedente = (index + 1) > grupo.maximo;
                            if (esExcedente && !grupo.permiteExcedente) return;
                            const costoAdicional = esExcedente ? (opcionDB.precioAdicional || 0) : 0;
                            opcionesSeleccionadas.push({
                                grupoNombre: grupo.nombre,
                                opcionNombre: opcionDB.nombre,
                                precioExtra: costoAdicional
                            });
                            precioExtraAcumulado += costoAdicional;
                        }
                    });
                }
            }

            const precioUnitarioFinal = productoReal.precioBase + precioExtraAcumulado;
            const cantidad = aiItem.quantity || 1;
            const notasItem = aiItem.notes || ""; // Extraemos la nota de la IA

            // CORRECCIÓN: Ahora comparamos también las notas para no fusionar items con instrucciones diferentes
            const itemExistenteIdx = itemsValidados.findIndex(v => 
                v.itemId.toString() === productoReal._id.toString() && 
                JSON.stringify(v.opcionesSeleccionadas) === JSON.stringify(opcionesSeleccionadas) &&
                v.notas === notasItem // <--- IMPORTANTE
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
                    notas: notasItem // <--- CORRECCIÓN: "notas" en español para coincidir con la DB
                });
            }
        }
        return itemsValidados;
    } catch (error) {
        logger.error("Error crítico en validarPedido:", error);
        return [];
    }
};

/**
 * Función 2: Calcula los totales financieros finales
 */
export const calcularTotalesFinales = (items, deliveryMode, restaurante) => {
    const subtotal = items.reduce((acc, item) => {
        const qty = item.quantity || item.cantidad || 0;
        const precio = item.precioUnitario || 0;
        return acc + (precio * qty);
    }, 0);

    const esPickup = deliveryMode === 'PICKUP';
    
    // USAR CENTAVOS: 3000 centavos = $30.00 pesos
    const costoEnvioBase = restaurante.configuracion?.costoEnvio || 3000; 
    const costoEnvioFinal = esPickup ? 0 : costoEnvioBase;

    return {
        subtotal,
        envio: costoEnvioFinal,
        total: subtotal + costoEnvioFinal,
        esPickup: deliveryMode === 'PICKUP'
    };
};