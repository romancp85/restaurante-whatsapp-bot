// frontend/src/main.jsx (Revisión Final)

import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom'; 

import App from './App.jsx';
import './index.css'; 

// 🛑 REVISA ESTO DE NUEVO 🛑
// Asegúrate que la capitalización de la carpeta y el nombre del archivo sean idénticos
import Pedidos from './Pages/Pedidos.jsx'; 
import Menu from './Pages/Menu.jsx';
import Configuracion from './Pages/Configuracion.jsx'; 

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}>
          
          {/* Si quieres aislar el problema, comenta temporalmente las rutas y usa una sola */}
          <Route index element={<Pedidos />} /> 
          <Route path="menu" element={<Menu />} />
          <Route path="config" element={<Configuracion />} />
          
          <Route path="*" element={<h1 className="p-8 text-xl">404: Ruta no encontrada</h1>} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);