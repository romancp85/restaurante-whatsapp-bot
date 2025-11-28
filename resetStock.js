import 'dotenv/config';
import mongoose from 'mongoose';
import MenuItem from './src/models/MenuItem.js';

try {
  await mongoose.connect(process.env.MONGODB_URI);
  await MenuItem.updateMany({}, { $set: { vendidas_hoy: 0 } });
  console.log('Stock reseteado al 100%');
} catch (err) {
  console.error('Error:', err);
} finally {
  process.exit();
}
