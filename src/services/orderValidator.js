import MenuItem from '../models/MenuItem.js';
import logger from '../utils/logger.js';

export const validarPedido = async (aiItems, businessId) => {
    try {
        if (!aiItems || !Array.isArray(aiItems)) return { itemsValidados: [], extrasRechazados: [] };
        
        const itemsValidados = [];
        const extrasRechazados = []; // 🌟 Para reportar lo que no se pudo cobrar/poner
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
            
            // 🌟 LÓGICA DE VALIDACIÓN DE EXTRAS ACTIVA
            if (aiItem.modifiers && Array.isArray(aiItem.modifiers)) {
                // Creamos un set de lo que el usuario pidió para marcar qué sí encontramos
                const modifiersSolicitados = [...aiItem.modifiers];
                const modifiersEncontrados = new Set();

                if (productoReal.modificadores?.length > 0) {
                    for (const grupo of productoReal.modificadores) {
                        // Filtramos cuáles de los pedidos del usuario están en este grupo
                        const seleccionadosDelUsuario = modifiersSolicitados.filter(m => 
                            grupo.opciones.some(opt => opt.nombre.toLowerCase().includes(m.toLowerCase()))
                        );

                        seleccionadosDelUsuario.forEach((modNombre, index) => {
                            const opcionDB = grupo.opciones.find(o => 
                                o.nombre.toLowerCase().includes(modNombre.toLowerCase())
                            );

                            if (opcionDB) {
                                modifiersEncontrados.add(modNombre); // Marcamos como encontrado
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

                // 🌟 DETECCIÓN DE HUÉRFANOS: Lo que el usuario pidió pero no está en la DB
                const huerfanos = modifiersSolicitados.filter(m => !modifiersEncontrados.has(m));
                if (huerfanos.length > 0) {
                    extrasRechazados.push({
                        producto: productoReal.nombre,
                        extras: huerfanos
                    });
                }
            }

            const precioUnitarioFinal = productoReal.precioBase + precioExtraAcumulado;
            const cantidad = aiItem.quantity || 1;
            const notasItem = aiItem.notes || "";

            const itemExistenteIdx = itemsValidados.findIndex(v => 
                v.itemId.toString() === productoReal._id.toString() && 
                JSON.stringify(v.opcionesSeleccionadas) === JSON.stringify(opcionesSeleccionadas) &&
                v.notas === notasItem
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
                    notas: notasItem 
                });
            }
        }

        // 🌟 Retornamos objeto estructurado
        return { itemsValidados, extrasRechazados };

    } catch (error) {
        logger.error("Error crítico en validarPedido:", error);
        return { itemsValidados: [], extrasRechazados: [] };
    }
};

/**
 * Función 2: Calcula los totales financieros finales
 */
export const calcularTotalesFinales = (items, deliveryMode, restaurante) => {
    const subtotal = items.reduce((acc, item) => {
        const qty = item.cantidad || item.quantity || 0;
        const precio = item.precioUnitario || 0;
        return acc + (precio * qty);
    }, 0);

    const esPickup = deliveryMode === 'PICKUP';
    const costoEnvioBase = restaurante.configuracion?.costoEnvioBase || 3000; 
    const costoEnvioFinal = esPickup ? 0 : costoEnvioBase;

    return {
        subtotal,
        envio: costoEnvioFinal,
        total: subtotal + costoEnvioFinal,
        esPickup: esPickup
    };
};