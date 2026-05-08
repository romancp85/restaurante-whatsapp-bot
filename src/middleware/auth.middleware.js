// src/middleware/auth.middleware.js
import jwt from 'jsonwebtoken';

export const verificarToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Formato: Bearer TOKEN

    if (!token) return res.status(403).json({ message: 'Acceso denegado. Token no provisto.' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'llave_maestra_123');
        
        // 🌟 LA MAGIA: Inyectamos el businessId en el request
        req.businessId = decoded.bid;
        req.usuarioId = decoded.uid;
        
        next();
    } catch (error) {
        return res.status(401).json({ message: 'Sesión expirada o token inválido.' });
    }
};