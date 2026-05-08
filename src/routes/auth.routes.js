// src/routes/auth.routes.js
import express from 'express';
import { login } from '../controllers/auth.controller.js';

const router = express.Router();

// Esta ruta NO lleva verificación de token (porque es para entrar)
router.post('/login', login);

export default router;