// src/services/businessRules.js

export const applyInference = (extractedData, currentTempData) => {
    if (!extractedData) return currentTempData;

    const { nombre, direccion, metodoPago, modoEntrega, notasPago, notasCocina } = extractedData;
    const clean = (val) => (val && val !== 'null' && val !== 'undefined') ? val.trim() : null;

    const dirLimpia = clean(direccion);
    let modoLimpio = clean(modoEntrega);
    let pagoLimpio = clean(metodoPago);

    // 📍 Inferencia de Entrega
    // 🌟 MEJORA: Si la dirección parece una instrucción de Recoger
    if (dirLimpia && (dirLimpia.toLowerCase().includes('recoger') || dirLimpia.toLowerCase().includes('tienda'))) {
        console.log("-> Inferencia: El usuario quiere recoger, no es una dirección.");
        modoLimpio = 'PICKUP';
        dirLimpia = 'RECOGIDA EN TIENDA'; // Limpiamos el texto basura
    }
    // 💳 Inferencia de Pago
    const notas = [clean(notasPago || notasPago), clean(notasCocina)].filter(Boolean).join(' ').toLowerCase();
    if (!pagoLimpio) {
        if (notas.includes('billete') || notas.includes('cambio') || notas.includes('efectivo')) pagoLimpio = 'Efectivo';
        else if (notas.includes('tarjeta') || notas.includes('terminal')) pagoLimpio = 'Tarjeta';
    }

    // 🌟 REGLA DE ORO: No sobrescribir lo que el usuario borró manualmente
    return {
        ...currentTempData, // Mantenemos el historial y otros campos
        name: clean(nombre) || currentTempData.name,
        address: dirLimpia || currentTempData.address,
        deliveryMode: modoLimpio || currentTempData.deliveryMode,
        paymentMethod: pagoLimpio ? (pagoLimpio.charAt(0).toUpperCase() + pagoLimpio.slice(1).toLowerCase()) : currentTempData.paymentMethod,
        orderNotes: notas || currentTempData.orderNotes
    };
};