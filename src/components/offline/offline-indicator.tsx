"use client";

import { useEffect, useState } from "react";

type OfflineIndicatorProps = {
  /** Mostrar solo en móviles (sm y abajo) */
  mobileOnly?: boolean;
};

/**
 * Componente que muestra un banner indicando si el usuario está online o offline.
 * Usa los eventos del navegador y la API Service Worker para detectar estado.
 */
export function OfflineIndicator({ mobileOnly = true }: OfflineIndicatorProps = {}) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [swReady, setSwReady] = useState(false);

  useEffect(() => {
    // Listeners de conexión online/offline
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Detectar si el SW está activo (basado en la disponibilidad de navigator.serviceWorker)
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then((registration) => {
        setSwReady(true);

        // Escuchar mensajes del SW sobre estado de caché/sincronización
        const subscriber = registration.active as any;
        if (subscriber?.postMessage) {
          subscriber.postMessage({ type: "GET_STATUS" }).catch(() => {});
        }
      });
    }
  }, []);

  if (!isOnline) {
    return (
      <div
        className="fixed top-0 left-0 right-0 z-50 bg-destructive/90 backdrop-blur-sm border-b border-destructive/20 text-sm"
        aria-live="polite"
      >
        <div className="p-4 text-sm text-destructive">
          <strong>Sin conexión a internet</strong><br/>
          Estás operando en modo offline. Algunas funciones pueden estar
          limitadas. Los datos se sincronizarán cuando restablezcas la conexión.
          <a
            href="#"
            onClick={() => window.location.reload()}
            className="mt-2 hover:underline text-muted-foreground/60"
          >
            Reintentar
          </a>
        </div>
      </div>
    );
  }

  // Mostrar solo en móviles si el prop lo indica y no estamos en modo estricto offline
  if (mobileOnly && isOnline && !swReady) {
    return null;
  }

  return null;
}