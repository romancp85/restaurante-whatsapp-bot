import 'dotenv/config';
import mongoose from 'mongoose';
import Restaurante from './src/models/Restaurante.js';
import MenuItem from './src/models/MenuItem.js';
import GlobalConfig from './src/models/GlobalConfig.js';

async function seed() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("🚀 Conectado. Limpiando datos antiguos...");

        // 1. LIMPIEZA TOTAL (Para evitar errores de duplicado durante la prueba)
        await Restaurante.deleteMany({});
        await MenuItem.deleteMany({});
        await GlobalConfig.deleteMany({});

        // 2. CREAR EL RESTAURANTE (Tu ID real)
        const res = await Restaurante.create({
            nombre: "Hamburguesas El SaaS",
            slug: "burgers-saas",
            whatsappPhoneId: "1092168580637791", // 👈 Tu ID detectado
            whatsappToken: process.env.WHATSAPP_TOKEN, // Usa el de tu .env
            whatsappVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN || "roman123prueba",
            activo: true
        });

        const bId = res._id;

        // 3. CONFIGURACIÓN DEL RESTAURANTE
        await GlobalConfig.create({
            businessId: bId,
            clientId: "CONFIG_" + bId,
            costoEnvioCents: 3000,
            acceptedPaymentMethods: ['Efectivo', 'Transferencia'],
            transferDetailsMessage: "CLABE: 0123456789 | Banco: SaaSBank"
        });

        // 4. MENÚ DE PRUEBA
        await MenuItem.create([
            {
                businessId: bId,
                nombre: "Hamburguesa Simple",
                precioBase: 5000,
                categoria: "HAMBURGUESAS",
                tipoProducto: "simple",
                diasDisponibles: [0, 1, 2, 3, 4, 5, 6]
            },
            {
                businessId: bId,
                nombre: "Pizza Pepperoni",
                precioBase: 15000,
                categoria: "PIZZAS",
                tipoProducto: "compuesto",
                modificadores: [{
                    nombre: "Extras",
                    maximo: 2,
                    opciones: [
                        { nombre: "Extra Queso", precioAdicional: 2000 },
                        { nombre: "Tocino", precioAdicional: 2500 }
                    ]
                }]
            }
        ]);

        console.log("✅ ¡TODO LISTO!");
        console.log(`Restaurante creado con ID: ${bId}`);
        process.exit();
    } catch (err) {
        console.error("❌ Error en el seed:", err);
        process.exit(1);
    }
}

seed();