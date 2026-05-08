// src/models/Usuario.js
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const UsuarioSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    nombre: { type: String, required: true },
    businessId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Restaurante', 
        required: true 
    },
    rol: { type: String, enum: ['admin', 'cajero'], default: 'admin' }
}, { timestamps: true });

// Encriptar contraseña antes de guardar
UsuarioSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 10);
    next();
});

// Método para comparar contraseñas
UsuarioSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model('Usuario', UsuarioSchema);