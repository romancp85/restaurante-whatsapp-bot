// src/services/businessRules.js

export const applyInference = (extractedData, currentTempData) => {
    if (!extractedData) return currentTempData;

    const { nombre, direccion, metodoPago, modoEntrega, notasPago, notasCocina } = extractedData;
    const clean = (val) => (val && val !== 'null' && val !== 'undefined') ? val.trim() : null;

    const dirLimpia = clean(direccion);
    let modoLimpio = clean(modoEntrega);
    let pagoLimpio = clean(metodoPago);

    // 📍 Inferencia de Entrega
    if (dirLimpia && !modoLimpio) modoLimpio = 'DELIVERY';

    // 💳 Inferencia de Pago (Basada en palabras clave)
    const notas = [clean(notasPago), clean(notasCocina)].filter(Boolean).join(' ').toLowerCase();
    if (!pagoLimpio) {
        if (notas.includes('billete') || notas.includes('cambio') || notas.includes('efectivo')) pagoLimpio = 'Efectivo';
        else if (notas.includes('tarjeta') || notas.includes('terminal')) pagoLimpio = 'Tarjeta';
        else if (notas.includes('transferencia')) pagoLimpio = 'Transferencia';
    }

    // Retornamos el objeto de datos actualizado
    return {
        name: clean(nombre) || currentTempData.name,
        address: dirLimpia || currentTempData.address,
        deliveryMode: modoLimpio || currentTempData.deliveryMode,
        paymentMethod: pagoLimpio ? (pagoLimpio.charAt(0).toUpperCase() + pagoLimpio.slice(1).toLowerCase()) : currentTempData.paymentMethod,
        orderNotes: notas || currentTempData.orderNotes
    };
};