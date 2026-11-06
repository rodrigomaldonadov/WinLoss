import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El indicador flotante de Next tapa el menú de usuario en el sidebar.
  devIndicators: false,
  // Permitir origen cruzado para HMR en desarrollo desde IP local
  allowedDevOrigins: ['192.168.18.218'],
  // Modo oscuro desactivado temporalmente - next/16 no soporta darkMode nativo.
  // darkMode: "class",
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;