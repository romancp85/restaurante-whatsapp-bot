// src/server.js - CÓDIGO FINAL Y CORREGIDO

import 'dotenv/config';

// 🛑 FUERZA LA ZONA HORARIA DEL SERVIDOR 🛑
if (process.env.TZ) {
    process.env.TZ = process.env.TZ;
}

import express from 'express';
import mongoose from 'mongoose';

// === IMPORTACIONES DE MODELOS Y RUTAS (TODAS EN LA CIMA) ===
import Configuracion from './models/Configuracion.js';
import MenuItem from './models/MenuItem.js';

import menuRoutes from './routes/menu.routes.js';
import orderRoutes from './routes/order.routes.js'; // Necesaria para el panel

import { verifyWebhook, receiveMessage } from './whatsapp/webhook.js'; // Necesaria para el webhook
// ==========================================================

// === App y puerto ===
const app = express();
const PORT = process.env.PORT || 3000;

// === Middleware ===
app.use(express.json());

// === Log de Verificación de Zona Horaria ===
console.log(`[VERIFICACIÓN ZONA HORARIA] Hora local actual del proceso: ${new Date().toLocaleString()}`);


// === FUNCIONES DE INICIALIZACIÓN ===
async function crearConfiguracionInicial() {
    // ... (el cuerpo de tu función crearConfiguracionInicial sin cambios)
    const count = await Configuracion.countDocuments({ nombre: 'horarios_operacion' });
    
    if (count === 0) {
        await Configuracion.create({
            nombre: 'horarios_operacion',
            dias_operacion: [
                { dia: 'LUNES', activo: true, turnos: [{ apertura: '12:00', cierre: '22:00' }] },
                { dia: 'MARTES', activo: true, turnos: [{ apertura: '12:00', cierre: '22:00' }] },
                { dia: 'MIÉRCOLES', activo: true, turnos: [{ apertura: '12:00', cierre: '22:00' }] },
                { dia: 'JUEVES', activo: true, turnos: [{ apertura: '12:00', cierre: '22:00' }] },
                { dia: 'VIERNES', activo: true, turnos: [{ apertura: '12:00', cierre: '23:00' }] },
                { dia: 'SÁBADO', activo: true, turnos: [{ apertura: '12:00', cierre: '23:00' }] },
                { dia: 'DOMINGO', activo: false, turnos: [] }
            ]
        });
        console.log('✅ Configuración de horarios inicial creada en MongoDB.');
    }
}

async function crearMenuInicial() {
    // ... (el cuerpo de tu función crearMenuInicial sin cambios)
    const count = await MenuItem.countDocuments();
    if (count === 0) {
        await MenuItem.create([
            { nombre: "Hamburguesa Clásica", precio: 5500, cantidad_diaria: 10, alerta_en: 7 },
            { nombre: "Hamburguesa BBQ",     precio: 6500, cantidad_diaria: 8,  alerta_en: 6 },
            { nombre: "Hamburguesa Vegana",  precio: 6000, cantidad_diaria: 5,  alerta_en: 4 },
            { nombre: "Papas Fritas",        precio: 2500, cantidad_diaria: 20, alerta_en: 15 },
            { nombre: "Coca Cola",           precio: 1500, cantidad_diaria: 30, alerta_en: 20 }
        ]);
        console.log('Menú inicial creado con stock diario');
    }
}


// === CONEXIÓN A MONGODB Y LLAMADA A INICIALIZACIONES ===
mongoose.connect(process.env.MONGODB_URI)
  .then(async () => { 
    console.log('MongoDB conectado - ¡Base de datos lista!');
    
    // 1. Ejecutar la creación de la DB
    await crearMenuInicial();
    await crearConfiguracionInicial();
    
    // === RUTAS (Usamos las variables importadas en la cima) ===
    app.use('/api', menuRoutes); 
    app.use('/api', orderRoutes); 
    
    // === WEBHOOK DE WHATSAPP ===
    app.get('/webhook', verifyWebhook);
    app.post('/webhook', express.json(), receiveMessage);

    // === RUTA DE PRUEBA ===
    app.get('/', (req, res) => {
        res.json({ mensaje: '¡Hola desde el Bot de Restaurante WhatsApp!' });
    });

    // 3. Arrancar el servidor Express solo después de la conexión exitosa
    app.listen(PORT, () => {
        console.log(`Servidor corriendo en http://localhost:${PORT}`);
        console.log(`Webhook listo en: http://localhost:${PORT}/webhook`);
    });

  })
  .catch(err => {
      console.error('Error MongoDB:', err.message);
      process.exit(1);
  });