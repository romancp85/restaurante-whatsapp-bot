// frontend/src/Pages/Pedidos.jsx

import React from 'react';

function Pedidos() {
  // 🛑 Asegúrate de que esta función devuelva JSX visible 🛑
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold text-gray-800">
        📋 Módulo de Pedidos Activos
      </h1>
      <p className="mt-2 text-gray-600">
        ¡Felicidades! La interfaz de administrador está funcionando.
      </p>
      {/* Puedes agregar un botón simple para verificar que Tailwind funciona */}
      <button className="mt-4 bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700">
        Ver Lista de Pedidos
      </button>
    </div>
  );
}
export default Pedidos;