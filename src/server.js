// src/server.js
import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors'; 
import crypto from 'crypto'; // 🛡️ Para validación criptográfica
import rateLimit from 'express-rate-limit'; // 🛡️ Para protección económica
import logger from './utils/logger.js'; 

// === IMPORTACIONES DE RUTAS ===
import menuRoutes from './routes/menu.routes.js';
import orderRoutes from './routes/order.routes.js';
import configRouter from './routes/config.routes.js';
import webhookRouter from './whatsapp/webhook.js'; 

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * 🛡️ CAPA DE SEGURIDAD 1: Verificación de Firma HMAC SHA256
 * Esta función intercepta el cuerpo del mensaje "crudo" (raw body) 
 * antes de que Express lo convierta en JSON. Es la única forma de 
 * validar que el mensaje viene REALMENTE de Meta.
 */
const verifyMetaSignature = (req, res, buf, encoding) => {
    const signature = req.headers['x-hub-signature-256'];
    
    // Solo validamos si es una petición al webhook de WhatsApp
    if (req.originalUrl.startsWith('/webhook') && req.method === 'POST') {
        if (!signature) {
            logger.warn(`🚨 Intento de acceso sin firma desde IP: ${req.ip}`);
            throw new Error('Firma ausente. Petición rechazada.');
        }

        const elements = signature.split('=');
        const signatureHash = elements[1];
        const expectedHash = crypto
            .createHmac('sha256', process.env.WHATSAPP_APP_SECRET) // Tu secreto de Meta
            .update(buf) // El buffer crudo del mensaje
            .digest('hex');

        if (signatureHash !== expectedHash) {
            logger.error(`❌ ALERTA: Firma inválida detectada desde IP: ${req.ip}`);
            throw new Error('Firma inválida. Intento de intrusión detectado.');
        }
    }
};

// === MIDDLEWARES GLOBALES ===

// 🛡️ Aplicamos la verificación de firma dentro del parseador de JSON
app.use(express.json({ verify: verifyMetaSignature })); 
app.use(cors()); 

// 🛡️ CAPA DE SEGURIDAD 2: Rate Limiting (Protección de DDoS y Costos de IA)
// Limitamos las peticiones globales para evitar abusos
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutos
    max: 100, // 100 peticiones por IP cada 15 min
    message: "Demasiadas peticiones desde esta red."
});
app.use('/api/', generalLimiter);

// === INTEGRACIÓN DE RUTAS ===

// Rutas de WhatsApp (El Webhook)
app.use(webhookRouter); 

// Rutas de API para el Dashboard
app.use('/api/menu', menuRoutes); 
app.use('/api/pedidos', orderRoutes); 
app.use('/api/config', configRouter); 

// RUTA DE PRUEBA
app.get('/', (req, res) => {
    res.json({ status: 'online', version: '2.0.0-square-level' });
});

// === CONEXIÓN A MONGODB Y ARRANQUE ===
mongoose.connect(process.env.MONGODB_URI)
  .then(() => { 
    logger.info('✅ Conexión a MongoDB exitosa');
    
    app.listen(PORT, () => {
        logger.info(`🚀 Servidor Enterprise corriendo en puerto ${PORT}`);
        logger.info(`🔐 Escudo HMAC SHA256 Activo para Webhook`);
    });
  })
  .catch(err => {
      logger.error('💥 Error crítico al iniciar servidor:', err.message);
      process.exit(1);
  });