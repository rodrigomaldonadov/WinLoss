"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/**
 * Banner discreto que aparece cuando el navegador pierde la conexión.
 * No bloquea la interacción: informa y permite reintentar.
 */
export function OfflineIndicator() {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const update = () => setIsOffline(!navigator.onLine);

    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-2 border-b border-amber-500/30 bg-amber-500/15 px-4 py-2 text-xs font-medium text-amber-200 backdrop-blur-md"
    >
      <WifiOff className="size-4 shrink-0" aria-hidden />
      <span>Sin conexión · mostrando datos guardados</span>
    </div>
  );
}
