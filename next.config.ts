import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El indicador flotante de Next tapa el menú de usuario en el sidebar.
  devIndicators: false,
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
