"use client";

import { useEffect } from "react";

/**
 * Registra el Service Worker nativo (/sw.js) y se asegura de activar
 * nuevas versiones sin dejar la app con caché obsoleta.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;

    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js", {
          scope: "/",
          updateViaCache: "none",
        });
        if (cancelled) return;

        // Si hay una versión esperando, activarla de inmediato.
        if (registration.waiting) {
          registration.waiting.postMessage("SKIP_WAITING");
        }

        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener("statechange", () => {
            if (
              installing.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              installing.postMessage("SKIP_WAITING");
            }
          });
        });
      } catch (error) {
        // No bloqueamos la app si el SW falla (p. ej. navegador antiguo).
        console.warn("No se pudo registrar el Service Worker:", error);
      }
    };

    void register();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
