import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WinLoss — Bankroll Tracker",
    short_name: "WinLoss",
    description:
      "Gestiona tu bankroll, registra tus apuestas y mide tu rentabilidad real.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#059669",
    lang: "es",
    categories: ["finance", "sports", "productivity"],
  };
}
