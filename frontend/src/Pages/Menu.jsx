// frontend/src/Pages/Menu.jsx

import React from 'react';

function Menu() {
  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold text-gray-800">
        🍔 Gestión de Menú y Stock Diario
      </h1>
      
      {/* Sección 1: Configuración de Stock (Ejemplo) */}
      <div className="mt-8 p-6 bg-white shadow rounded-lg">
        <h2 className="text-xl font-semibold mb-4 text-red-600">
          Stock Diario
        </h2>
        <p className="text-gray-600">
          Aquí podrás ver y modificar las cantidades disponibles (por ejemplo, solo quedan 50 bollos de pan hoy).
        </p>
        {/* Aquí irá la tabla de productos con campos para editar 'cantidad_diaria' */}
      </div>

      {/* Sección 2: CRUD de Productos */}
      <div className="mt-8 p-6 bg-white shadow rounded-lg">
        <h2 className="text-xl font-semibold mb-4 text-red-600">
          Añadir / Editar Producto
        </h2>
        <p className="text-gray-600">
          Formularios para agregar nuevas hamburguesas o modificar precios.
        </p>
      </div>

    </div>
  );
}

// 🛑 EXPORTACIÓN CRÍTICA: Asegura que el componente se exporte por defecto 🛑
export default Menu;