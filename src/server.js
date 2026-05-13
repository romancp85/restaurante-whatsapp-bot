// src/server.js
import 'dotenv/config';

// 🛑 GUARDIA DE ARRANQUE (Mantenemos la excelente idea de Claude)
const REQUIRED_ENV = ['MONGODB_URI', 'JWT_SECRET', 'WHATSAPP_APP_SECRET', 'WHATSAPP_VERIFY_TOKEN'];
const missingEnv = REQUIRED_ENV.filter(key => !process.env[key]);
if (missingEnv.length > 0) {
    console.error('❌ FATAL: Variables de entorno requeridas no definidas:', missingEnv);
    process.exit(1);
}

import express from 'express';
import { createServer } from 'http';
import mongoose from 'mongoose';
import cors from 'cors';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './utils/logger.js';
import jwt from 'jsonwebtoken';
import * as socketPkg from 'socket.io';

// Importaciones de rutas
import authRoutes from './routes/auth.routes.js';
import menuRoutes from './routes/menu.routes.js';
import orderRoutes from './routes/order.routes.js';
import configRouter from './routes/config.routes.js';
import webhookRouter from './whatsapp/webhook.js';

const SocketServer = socketPkg.Server || socketPkg.default?.Server || socketPkg.default;
const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Configuración de Socket.io
const io = new SocketServer(httpServer, {
    cors: { origin: process.env.ALLOWED_ORIGIN || '*', methods: ['GET', 'POST'] },
});

// 🌟 SOLUCIÓN AL CÍRCULO VICIOSO:
global.io = io; 

io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error('authentication_error'));
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.businessId = decoded.bid.toString();
        next();
    } catch { next(new Error('authentication_error')); }
});

io.on('connection', (socket) => {
    socket.join(socket.businessId);
    logger.info(`[Socket] Dashboard conectado a sala: ${socket.businessId}`);
});

// 2. Seguridad HMAC para Meta
const verifyMetaSignature = (req, res, buf) => {
    if (!req.originalUrl.startsWith('/webhook') || req.method !== 'POST') return;
    const signature = req.headers['x-hub-signature-256'];
    if (!signature) throw new Error('Firma HMAC ausente.');
    const expectedHash = crypto.createHmac('sha256', process.env.WHATSAPP_APP_SECRET).update(buf).digest('hex');
    const received = signature.split('=')[1];
    if (!crypto.timingSafeEqual(Buffer.from(received, 'hex'), Buffer.from(expectedHash, 'hex'))) {
        throw new Error('Firma HMAC inválida.');
    }
};

// 3. Middlewares y Rutas
app.use(express.json({ verify: verifyMetaSignature }));
app.use(cors());
app.use(express.static(path.join(__dirname, '../public')));
app.use('/api/auth', authRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/pedidos', orderRoutes);
app.use('/api/config', configRouter);
app.use(webhookRouter);

// 4. Arranque con Carga de Worker
mongoose.connect(process.env.MONGODB_URI)
    .then(async () => {
        logger.info('✅ Conexión a MongoDB exitosa');
        try {
            // Importación dinámica: el worker ahora encontrará global.io listo
            await import('./workers/orderWorker.js');
            logger.info('🤖 Workers de BullMQ activos');
        } catch (e) {
            console.error("💥 ERROR AL CARGAR EL WORKER:", e);
        }
        httpServer.listen(PORT, () => logger.info(`🚀 Servidor en puerto ${PORT}`));
    })
    .catch(err => {
        logger.error('💥 Error crítico MongoDB:', err.message);
        process.exit(1);
    });
