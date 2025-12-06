// src/utils/formatter.js - 100% compatible con ES modules
const formatPrice = (cents) => {
  return (cents / 100).toLocaleString('es-MX', {
    style: 'currency',
    currency: 'MXN'
  });
};

const safeSend = async (fn, ...args) => {
  try {
    await fn(...args);
  } catch (error) {
    console.error('Error en safeSend:', error);
  }
};

export { formatPrice, safeSend };