"use client";

/**
 * Último límite: sustituye al layout raíz, así que no puede depender de
 * Tailwind ni de componentes de la app. Estilos en línea a propósito.
 */
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: "1.5rem",
          background: "#0a0a0f",
          color: "#f5f5f5",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
        }}
      >
        <div style={{ maxWidth: 360, textAlign: "center" }}>
          <h1 style={{ margin: 0, fontSize: 18 }}>La app no pudo cargar</h1>
          <p
            style={{
              margin: "8px 0 20px",
              fontSize: 13,
              lineHeight: 1.5,
              color: "#a1a1aa",
            }}
          >
            Vuelve a intentarlo. Si el problema sigue, revisa la conexión con el
            servidor.
          </p>
          <div
            style={{
              display: "flex",
              gap: 8,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={reset}
              style={{
                height: 44,
                padding: "0 18px",
                borderRadius: 10,
                border: "none",
                background: "#16a34a",
                color: "#fff",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Reintentar
            </button>
            {/* global-error sustituye al layout raíz: no hay router que usar. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                height: 44,
                display: "inline-flex",
                alignItems: "center",
                padding: "0 18px",
                borderRadius: 10,
                border: "1px solid #3f3f46",
                color: "#f5f5f5",
                fontSize: 14,
                textDecoration: "none",
              }}
            >
              Ir al inicio
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
