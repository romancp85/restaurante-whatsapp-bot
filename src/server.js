// src/server.js
import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import mongoose from 'mongoose';
import cors from 'cors'; 
import crypto from 'crypto'; 
import rateLimit from 'express-rate-limit'; 
import path from 'path';
import { fileURLToPath } from 'url';
import logger from './utils/logger.js'; 
import authRoutes from './routes/auth.routes.js';
import jwt from 'jsonwebtoken'; 

// 🛑 IMPORTACIÓN ROBUSTA DE SOCKET.IO 🛑
import * as socketIo from 'socket.io';
// Intentamos obtener la clase Server de todas las formas posibles
const ServerClass = socketIo.Server || (socketIo.default && socketIo.default.Server) || socketIo.default;

// === IMPORTACIONES DE RUTAS ===
import menuRoutes from './routes/menu.routes.js';
import orderRoutes from './routes/order.routes.js';
import configRouter from './routes/config.routes.js';
import webhookRouter from './whatsapp/webhook.js'; 

const app = express();
const httpServer = createServer(app);
const PORT = process.env.PORT || 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// === 1. CONFIGURACIÓN DE SOCKET.IO ===
let io;
try {
    io = new ServerClass(httpServer, {
        cors: { origin: "*", methods: ["GET", "POST"] }
    });
    global.io = io;
    logger.info("📡 Socket.io inicializado correctamente");
} catch (e) {
    logger.error("❌ Error fatal al inicializar Socket.io. Revisa la versión instalada.");
    process.exit(1);
}

// 1. EL FILTRO DE SEGURIDAD (Middleware)
io.use((socket, next) => {
    // Buscamos el token en todas partes posibles
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;

    if (!token) {
        console.log("🚫 [Socket] Intento de conexión sin token.");
        return next(new Error("authentication_error"));
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'llave_maestra_123');
        // Guardamos los datos decodificados dentro del socket para usarlos después
        socket.businessId = decoded.bid.toString();
        socket.usuarioId = decoded.uid;
        next(); // Todo bien, adelante
    } catch (e) {
        console.log("🚫 [Socket] Token inválido.");
        return next(new Error("authentication_error"));
    }
});

// 2. LA CONEXIÓN (Solo llegan aquí los que pasaron el filtro)
io.on('connection', (socket) => {
    // Ya sabemos el businessId porque el middleware lo guardó en el socket
    const salaId = socket.businessId;
    
    socket.join(salaId);
    console.log(`✅ [Socket] Dashboard autorizado en sala: ${salaId} (ID: ${socket.id})`);

    // Confirmación inmediata al Dashboard
    socket.emit('SERVER_READY', { message: "Conectado a sala " + salaId });

    socket.on('disconnect', () => {
        console.log(`🔌 [Socket] Dashboard desconectado (ID: ${socket.id})`);
    });
});

/** 🛡️ CAPA DE SEGURIDAD META */
const verifyMetaSignature = (req, res, buf, encoding) => {
    const signature = req.headers['x-hub-signature-256'];
    if (req.originalUrl.startsWith('/webhook') && req.method === 'POST' && signature) {
        const expectedHash = crypto.createHmac('sha256', process.env.WHATSAPP_APP_SECRET).update(buf).digest('hex');
        if (signature.split('=')[1] !== expectedHash) throw new Error('Firma inválida.');
    }
};

app.use(express.json({ verify: verifyMetaSignature })); 
app.use(cors()); 
app.use(express.static(path.join(__dirname, '../public')));

app.use(webhookRouter);
app.use('/api/auth', authRoutes);  
app.use('/api/menu', menuRoutes); 
app.use('/api/pedidos', orderRoutes); 
app.use('/api/config', configRouter); 

app.get('/', (req, res) => res.json({ status: 'online' }));

// === 3. CONEXIÓN Y ARRANQUE ===
mongoose.connect(process.env.MONGODB_URI)
  .then(async () => { 
    logger.info('✅ Conexión a MongoDB exitosa');
    
    // 🚀 INTENTO DE CARGA DEL WORKER (CON PREVENCIÓN DE CRASH POR REDIS)
    try {
        await import('./workers/orderWorker.js');
        logger.info('🤖 Workers de BullMQ activos');
    } catch (e) {
        logger.warn('⚠️ WORKER NO INICIADO: Es posible que Redis no esté corriendo.');
        logger.warn('El sistema funcionará, pero los pedidos de WhatsApp no se procesarán.');
    }

    httpServer.listen(PORT, () => {
        logger.info(`🚀 Servidor corriendo en puerto ${PORT}`);
    });
  })
  .catch(err => {
      logger.error('💥 Error crítico MongoDB:', err.message);
      process.exit(1);
  });