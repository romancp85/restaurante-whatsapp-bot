// src/server.js - CÓDIGO FINAL CORREGIDO Y COMPLETO PARA EL PANEL

import 'dotenv/config';

// === CONFIGURACIÓN BASE ===
// Asegurar que la zona horaria del proceso se mantenga si está definida
if (process.env.TZ) {
    process.env.TZ = process.env.TZ;
}

import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors'; 
import logger from './utils/logger.js'; 
// ==========================================================

// === IMPORTACIONES DE MODELOS ===
import Configuracion from './models/Configuracion.js';
import MenuItem from './models/MenuItem.js'; 
import GlobalConfig from './models/GlobalConfig.js'; 
// ==========================================================

// === IMPORTACIONES DE RUTAS Y WEBHOOK ===
import menuRoutes from './routes/menu.routes.js';
import orderRoutes from './routes/order.routes.js';
import configRouter from './routes/config.routes.js';
// 🛑 CORRECCIÓN CRÍTICA: Importamos el router completo como default 🛑
import webhookRouter from './whatsapp/webhook.js'; 
// ==========================================================

// === App y puerto ===
const app = express();
const PORT = process.env.PORT || 3000;

// === Middleware Global ===
app.use(express.json()); 
app.use(cors()); 

logger.info(`[VERIFICACIÓN ZONA HORARIA] Hora local actual del proceso: ${new Date().toLocaleString()}`);


// === FUNCIONES DE INICIALIZACIÓN (Utilizando el modelo GlobalConfig proporcionado) ===

async function crearGlobalConfigInicial() {
    const count = await GlobalConfig.countDocuments({ clientId: 'GLOBAL_RESTAURANT' });
    if (count === 0) {
        // Aseguramos que el costo de envío exista para la nueva lógica
        await GlobalConfig.create({
            clientId: 'GLOBAL_RESTAURANT',
            acceptedPaymentMethods: ['Efectivo', 'Transferencia', 'Tarjeta'], 
            closedMessage: '¡Hola! Nuestro horario de atención es limitado. Estamos cerrados ahora mismo.',
            costoEnvioCents: 3000, // Añadido para la consistencia del servicio
            transferDetailsMessage: "CLABE: 0123456789. Enviar comprobante al 999 555 1234."
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
                { dia: 'MARTES', activo: true, turnos: [{ apertura: '12:00', cierre: '22:00' }] },
                // Añade el resto de días
            ],
            mensaje_cerrado: 'Estamos cerrados. Vuelve mañana a las 12:00.'
        });
        logger.info('✅ Configuración de horarios inicial creada en MongoDB.');
    }
}

async function crearMenuInicial() {
    const count = await MenuItem.countDocuments();
    if (count === 0) {
        await MenuItem.create([
            { nombre: "Hamburguesa Clásica", precio: 5500, cantidad_diaria: 10, alerta_en: 7, categoria: 'HAMBURGUESAS' },
            { nombre: "Papas Fritas", precio: 2000, cantidad_diaria: 25, alerta_en: 5, categoria: 'COMPLEMENTOS' },
            { nombre: "Coca Cola", precio: 1500, cantidad_diaria: 50, alerta_en: 10, categoria: 'BEBIDAS' },
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
    await crearGlobalConfigInicial(); 

    // 2. === INTEGRACIÓN DE RUTAS ===
    
    // Rutas de API para el Frontend (TODAS bajo /api)
    app.use('/api/menu', menuRoutes); 
    app.use('/api/pedidos', orderRoutes); 
    app.use('/api/config', configRouter); 
    
    // 🛑 Rutas de WhatsApp (Integra el router por defecto) 🛑
    // El router de webhook.js ya contiene app.get('/webhook') y app.post('/webhook')
    app.use(webhookRouter); 
    
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