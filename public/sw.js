/* WinLoss — Service Worker nativo (sin dependencias)
 * Estrategias:
 *  - Navegación: network-first con fallback a caché y página offline.
 *  - Assets inmutables de Next (/_next/static): cache-first.
 *  - Imágenes/fuentes: stale-while-revalidate.
 *  - API GET: network-first (sin cachear POST ni auth).
 */
const VERSION = "winloss-v1";
const SHELL_CACHE = `${VERSION}-shell`;
const ASSETS_CACHE = `${VERSION}-assets`;
const IMAGES_CACHE = `${VERSION}-images`;
const API_CACHE = `${VERSION}-api`;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll([OFFLINE_URL, "/icons/icon-192x192.png"]))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => !key.startsWith(VERSION))
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

async function networkFirst(request, cacheName, timeoutMs = 4000) {
  const cache = await caches.open(cacheName);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timer);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw new Error("offline");
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response && response.ok) cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || network;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (!isSameOrigin(url)) return;

  // Navegación (documentos HTML)
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await networkFirst(request, SHELL_CACHE, 5000);
          return response;
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          const cached = await cache.match(request);
          if (cached) return cached;
          const offline = await cache.match(OFFLINE_URL);
          if (offline) return offline;
          return new Response("Sin conexión", {
            status: 503,
            headers: { "Content-Type": "text/plain; charset=utf-8" },
          });
        }
      })(),
    );
    return;
  }

  // Assets de Next.js: network-first para no romper HMR en desarrollo;
  // si no hay red, se sirve la última copia cacheada.
  if (url.pathname.startsWith("/_next/")) {
    event.respondWith(
      networkFirst(request, ASSETS_CACHE, 3000).catch(() => {
        return caches
          .open(ASSETS_CACHE)
          .then((cache) => cache.match(request))
          .then((cached) => cached || Response.error());
      }),
    );
    return;
  }

  // Imágenes y fuentes
  if (/\.(?:png|jpg|jpeg|svg|webp|avif|gif|ico|woff2?|ttf|otf)$/i.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, IMAGES_CACHE));
    return;
  }

  // API (GET): network-first con fallback cacheado
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirst(request, API_CACHE, 5000).catch(
      () => new Response(JSON.stringify({ error: "offline" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }),
    ));
    return;
  }
});
