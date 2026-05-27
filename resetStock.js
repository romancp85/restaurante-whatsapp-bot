import "dotenv/config";
import mongoose from "mongoose";
import MenuItem from "./src/models/MenuItem.js";

try {
  await mongoose.connect(process.env.MONGODB_URI);
  await MenuItem.updateMany({}, { $set: { vendidas_hoy: 0 } });
  logger.info("[STOCK] Stock reseteado al 100%");
} catch (err) {
  logger.error("[STOCK] Error:", err);
} finally {
  process.exit();
}
