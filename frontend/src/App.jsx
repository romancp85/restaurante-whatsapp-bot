// frontend/src/App.jsx (Layout de Administración)

import { Outlet, Link } from 'react-router-dom';
// NO DEBE IMPORTAR NINGÚN CSS AQUÍ

const navItems = [
  { name: 'Pedidos', path: '/', icon: '📋' },
  { name: 'Menú y Stock', path: '/menu', icon: '🍔' },
  { name: 'Configuración', path: '/config', icon: '⚙️' },
];

function App() {
  return (
    // Aplica clases de Tailwind para el diseño del layout
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar de Navegación */}
      <aside className="w-64 bg-white shadow-xl p-4 flex flex-col">
        <div className="text-2xl font-black text-red-600 mb-8">
          Admin Bot-Rey
        </div>
        <nav className="flex flex-col space-y-2">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className="px-4 py-2 rounded-lg text-gray-700 hover:bg-red-100 hover:text-red-700 transition duration-150 flex items-center"
            >
              <span className="mr-2">{item.icon}</span>
              {item.name}
            </Link>
          ))}
        </nav>
      </aside>

      {/* Contenido Principal */}
      <main className="flex-1 overflow-y-auto p-4">
        {/* Outlet renderiza el componente de la ruta actual (Pedidos, Menu, Config) */}
        <Outlet />
      </main>
    </div>
  );
}

export default App;