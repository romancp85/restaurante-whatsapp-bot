// src/controllers/auth.controller.js
import Usuario from '../models/Usuario.js';
import jwt from 'jsonwebtoken';

export const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        // 1. Buscar usuario y traer sus datos de negocio
        const usuario = await Usuario.findOne({ email }).populate('businessId');
        if (!usuario) return res.status(401).json({ message: 'Credenciales inválidas' });

        // 2. Validar contraseña
        const isMatch = await usuario.comparePassword(password);
        if (!isMatch) return res.status(401).json({ message: 'Credenciales inválidas' });

        // 3. Crear el Token (Válido por 24h)
        const token = jwt.sign(
            { 
                uid: usuario._id, 
                bid: usuario.businessId._id,
                role: usuario.rol 
            }, 
            process.env.JWT_SECRET || 'llave_maestra_123', 
            { expiresIn: '24h' }
        );

        res.json({
            token,
            user: {
                nombre: usuario.nombre,
                restaurante: usuario.businessId.nombre,
                rol: usuario.rol
            }
        });
    } catch (error) {
        res.status(500).json({ message: 'Error en el servidor' });
    }
};