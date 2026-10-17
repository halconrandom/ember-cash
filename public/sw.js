/**
 * Service worker de Ember Cash. Caché ember-static-v1: solo el cascarón
 * offline y recursos estáticos. Nunca HTML autenticado, RSC (?_rsc o
 * cabecera RSC), /api/, /auth/ ni orígenes cruzados (Supabase). El contrato
 * que el test fija está en lib/pwa/cache-policy.ts. Este archivo lo repite
 * porque el worker no puede importar TypeScript.
 */
const CACHE = "ember-static-v1";
const PRECACHE = [
  "/offline.html",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/icons/icon-maskable-512.png",
  "/manifest.webmanifest",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function isStatic(path) {
  return (
    path.startsWith("/_next/static/") ||
    path.startsWith("/icons/") ||
    path === "/offline.html" ||
    path === "/manifest.webmanifest" ||
    path === "/favicon.ico" ||
    path === "/icon.svg"
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Supabase y cualquier otro origen: a la red, sin caché.
  if (url.origin !== self.location.origin) return;
  if (request.headers.get("RSC") === "1" || request.headers.get("Next-Router-Prefetch") === "1") return;
  if (url.searchParams.has("_rsc")) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline.html")));
    return;
  }

  if (!isStatic(url.pathname)) return;

  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
