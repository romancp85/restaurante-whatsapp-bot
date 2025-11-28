/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}", // <-- IMPORTANTE
  ],
  theme: {
    extend:{
      colors: {
        primary: "#E31837",   // rojo WhatsApp
        dark: "#121212",
        gray: "#1f1f1f"
      }
    },
  },
  plugins: [],
}