// public/admin/js/logger.js

export const logger = {
  info: (message, ...args) => {
    // Aquí puedes personalizar cómo se ve; por ejemplo, con colores en la consola
    console.log(
      `%c[INFO] ${message}`,
      "color: #3b82f6; font-weight: bold;",
      ...args,
    );
  },
  error: (message, ...args) => {
    console.error(
      `%c[ERROR] ${message}`,
      "color: #ef4444; font-weight: bold;",
      ...args,
    );
  },
  warn: (message, ...args) => {
    console.warn(
      `%c[WARN] ${message}`,
      "color: #f59e0b; font-weight: bold;",
      ...args,
    );
  },
};
