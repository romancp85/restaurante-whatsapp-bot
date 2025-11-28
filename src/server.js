// src/server.js - El corazón del proyecto (VERSIÓN FINAL QUE FUNCIONA 100%)
import 'dotenv/config';                 // ← ESTA ES LA LÍNEA MÁGICA (ES modules)
import express from 'express';
import mongoose from 'mongoose';

// === App y puerto ===
const app = express();
const PORT = process.env.PORT || 3000;

// === Middleware ===
app.use(express.json());

// === Conexión a MongoDB ===
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB conectado - ¡Base de datos lista!'))
  .catch(err => console.error('Error MongoDB:', err.message));

// === Ruta de prueba ===
app.get('/', (req, res) => {
  res.json({ mensaje: '¡Hola desde el Bot de Restaurante WhatsApp!' });
});

// === CREAR MENÚ INICIAL (solo la primera vez) ===
import MenuItem from './models/MenuItem.js';

async function crearMenuInicial() {
  const count = await MenuItem.countDocuments();
  if (count === 0) {
    await MenuItem.create([
      { nombre: "Hamburguesa Clásica", precio: 5500, cantidad_diaria: 10, alerta_en: 7 },
      { nombre: "Hamburguesa BBQ",     precio: 6500, cantidad_diaria: 8,  alerta_en: 6 },
      { nombre: "Hamburguesa Vegana",  precio: 6000, cantidad_diaria: 5,  alerta_en: 4 },
      { nombre: "Papas Fritas",        precio: 2500, cantidad_diaria: 20, alerta_en: 15 },
      { nombre: "Coca Cola",           precio: 1500, cantidad_diaria: 30, alerta_en: 20 }
    ]);
    console.log('Menú inicial creado con stock diario');
  }
}
crearMenuInicial();

// === RUTAS ===
import menuRoutes from './routes/menu.routes.js';
app.use('/api', menuRoutes);  // ← /api/menu y /api/order

// === WEBHOOK DE WHATSAPP ===
import { verifyWebhook, receiveMessage } from './whatsapp/webhook.js';
app.get('/webhook', verifyWebhook);
app.post('/webhook', express.json(), receiveMessage);

// === ARRANCAMOS EL SERVIDOR ===
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  console.log(`Webhook listo en: http://localhost:${PORT}/webhook`);
});