// src/server.js - CÓDIGO FINAL CORREGIDO Y COMPLETO PARA EL PANEL

import 'dotenv/config';

// === CONFIGURACIÓN BASE ===
if (process.env.TZ) {
    process.env.TZ = process.env.TZ;
}

import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors'; 
import logger from './utils/logger.js'; 
// ==========================================================

// === IMPORTACIONES DE MODELOS ===
import Configuracion from './models/Configuracion.js'; // Horarios
import MenuItem from './models/MenuItem.js'; // Menú
import GlobalConfig from './models/GlobalConfig.js'; // ⬅️ Configuración Global (Pagos/Mensajes)

// === IMPORTACIONES DE RUTAS ===
// Nota: Las importaciones deben coincidir con tu convención de nombres (.routes.js)
import menuRoutes from './routes/menu.routes.js';
import orderRoutes from './routes/order.routes.js';
import configRouter from './routes/config.routes.js'; // ⬅️ IMPORTACIÓN CORREGIDA A .routes.js
import { verifyWebhook, receiveMessage } from './whatsapp/webhook.js'; 
// ==========================================================

// === App y puerto ===
const app = express();
const PORT = process.env.PORT || 3000;

// === Middleware Global ===
app.use(express.json()); 
app.use(cors()); 

logger.info(`[VERIFICACIÓN ZONA HORARIA] Hora local actual del proceso: ${new Date().toLocaleString()}`);


// === FUNCIONES DE INICIALIZACIÓN ===

async function crearGlobalConfigInicial() {
    const count = await GlobalConfig.countDocuments({ clientId: 'GLOBAL_RESTAURANT' });
    if (count === 0) {
        await GlobalConfig.create({
            clientId: 'GLOBAL_RESTAURANT',
            acceptedPaymentMethods: ['Efectivo', 'Transferencia'], 
            closedMessage: '¡Hola! Nuestro horario de atención es limitado. Estamos cerrados ahora mismo.'
        });
        logger.info('✅ Configuración global de pagos/mensajes inicial creada.');
    }
}

async function crearConfiguracionInicial() {
    const count = await Configuracion.countDocuments({ nombre: 'horarios_operacion' });
    if (count === 0) {
        await Configuracion.create({
            nombre: 'horarios_operacion',
            dias_operacion: [
                { dia: 'LUNES', activo: true, turnos: [{ apertura: '12:00', cierre: '22:00' }] },
                // ... (El resto de tus días de la semana)
            ]
        });
        logger.info('✅ Configuración de horarios inicial creada en MongoDB.');
    }
}

async function crearMenuInicial() {
    const count = await MenuItem.countDocuments();
    if (count === 0) {
        await MenuItem.create([
            { nombre: "Hamburguesa Clásica", precio: 5500, cantidad_diaria: 10, alerta_en: 7, categoria: 'HAMBURGUESAS' },
            // ... (Otros ítems del menú)
        ]);
        logger.info('Menú inicial creado con stock diario');
    }
}


// === CONEXIÓN A MONGODB Y LLAMADA A INICIALIZACIONES ===
mongoose.connect(process.env.MONGODB_URI)
  .then(async () => { 
    logger.info('MongoDB conectado - ¡Base de datos lista!');
    
    // 1. Ejecutar la creación de la DB
    await crearMenuInicial();
    await crearConfiguracionInicial();
    await crearGlobalConfigInicial(); // ⬅️ Asegurar que GlobalConfig exista

    // 2. === INTEGRACIÓN DE RUTAS ===
    
    // Rutas de API para el Frontend (TODAS bajo /api)
    app.use('/api/menu', menuRoutes); 
    app.use('/api/pedidos', orderRoutes); 
    app.use('/api/config', configRouter); 
    
    // Rutas de WhatsApp (sin prefijo /api)
    app.get('/webhook', verifyWebhook);
    app.post('/webhook', receiveMessage); 
    
    // RUTA DE PRUEBA
    app.get('/', (req, res) => {
        res.json({ mensaje: '¡Hola desde el Bot de Restaurante WhatsApp!' });
    });

    // 3. Arrancar el servidor Express
    app.listen(PORT, () => {
        logger.info(`Servidor corriendo en http://localhost:${PORT}`);
        logger.info(`Webhook listo en: http://localhost:${PORT}/webhook`);
    });

  })
  .catch(err => {
      logger.error('Error MongoDB:', err.message);
      process.exit(1);
  });