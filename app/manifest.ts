/**
 * Manifest for WinLoss PWA.
 * Usa la convención nativa de Next.js App Router (app/manifest.ts).
 * Los iconos deben colocarse en public/icons/.
 */
export default {
  name: "WinLoss - Bankroll Tracker",
  short_name: "WinLoss",
  description: "Controla tus apuestas, bankroll y CLV",
  start_url: "/",
  display: "standalone",
  orientation: "portrait",
  background_color: "#0a0a0f",
  theme_color: "#1f1f2f",
  icons: [
    {
      src: "/icons/icon-192x192.png",
      sizes: "192x192",
      type: "image/png",
    },
    {
      src: "/icons/icon-512x512.png",
      sizes: "512x512",
      type: "image/png",
    },
    {
      src: "/icons/icon-512x512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "any",
    },
  ],
} as const;