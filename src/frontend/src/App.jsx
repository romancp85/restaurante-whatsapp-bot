import { useState } from 'react';
import { FiDollarSign, FiPackage, FiRefreshCw, FiMenu } from 'react-icons/fi';

function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="min-h-screen bg-dark">
      {/* NAVBAR */}
      <div className="bg-primary p-5 shadow-2xl">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <h1 className="text-3xl font-bold">🍔 PANEL DEL DUEÑO</h1>
          <div className="flex gap-6">
            <button onClick={() => setActiveTab('dashboard')} className={`px-6 py-3 rounded-lg text-lg font-bold ${activeTab === 'dashboard' ? 'bg-white text-primary' : 'bg-gray hover:bg-gray-700'}`}>
              Dashboard
            </button>
            <button onClick={() => setActiveTab('pedidos')} className={`px-6 py-3 rounded-lg text-lg font-bold ${activeTab === 'pedidos' ? 'bg-white text-primary' : 'bg-gray hover:bg-gray-700'}`}>
              Pedidos
            </button>
            <button onClick={() => setActiveTab('menu')} className={`px-6 py-3 rounded-lg text-lg font-bold ${activeTab === 'menu' ? 'bg-white text-primary' : 'bg-gray hover:bg-gray-700'}`}>
              Menú
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto p-8">
        {/* DASHBOARD */}
        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-10">
            <div className="bg-gray p-10 rounded-2xl text-center shadow-2xl">
              <FiDollarSign className="text-7xl text-green-500 mx-auto mb-4" />
              <h2 className="text-5xl font-bold">$125,000</h2>
              <p className="text-xl mt-2 opacity-80">Ventas hoy</p>
            </div>
            <div className="bg-gray p-10 rounded-2xl text-center shadow-2xl">
              <FiPackage className="text-7xl text-blue-500 mx-auto mb-4" />
              <h2 className="text-5xl font-bold">42</h2>
              <p className="text-xl mt-2 opacity-80">Pedidos hoy</p>
            </div>
            <div className="bg-gray p-10 rounded-2xl text-center shadow-2xl flex items-center justify-center">
              <button className="bg-primary hover:bg-red-700 text-white px-12 py-8 rounded-2xl font-bold text-2xl flex items-center gap-4 shadow-2xl">
                <FiRefreshCw size={40} />
                RESET STOCK DIARIO
              </button>
            </div>
          </div>
        )}

        {activeTab === 'pedidos' && (
          <div className="text-center mt-20 text-4xl opacity-60">
            Aquí aparecerán los pedidos en vivo 🔥
          </div>
        )}

        {activeTab === 'menu' && (
          <div className="text-center mt-20 text-4xl opacity-60">
            Aquí podrás editar tu menú completo 🍔
          </div>
        )}
      </div>
    </div>
  );
}

export default App;