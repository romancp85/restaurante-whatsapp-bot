// src/controllers/auth.controller.js
// FIX: JWT_SECRET ya no tiene fallback hardcodeado.
// La guardia de arranque en server.js garantiza que JWT_SECRET esté definido
// antes de llegar aquí. Si no está, el proceso ya terminó con exit(1).
import Usuario from '../models/Usuario.js';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger.js';

export const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ message: 'Email y contraseña requeridos.' });
        }

        // Buscar usuario con sus datos de negocio
        const usuario = await Usuario.findOne({ email: email.toLowerCase().trim() }).populate('businessId');
        if (!usuario) {
            // Mismo mensaje para email y contraseña incorrectos (evita user enumeration)
            return res.status(401).json({ message: 'Credenciales inválidas.' });
        }

        const isMatch = await usuario.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Credenciales inválidas.' });
        }

        // JWT_SECRET garantizado por la guardia de arranque de server.js
        const token = jwt.sign(
            {
                uid: usuario._id,
                bid: usuario.businessId._id,
                role: usuario.rol,
            },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            token,
            user: {
                nombre: usuario.nombre,
                restaurante: usuario.businessId.nombre,
                rol: usuario.rol,
            },
        });
    } catch (error) {
        logger.error('[Auth] Error en login:', error.message);
        res.status(500).json({ message: 'Error en el servidor.' });
    }
};
