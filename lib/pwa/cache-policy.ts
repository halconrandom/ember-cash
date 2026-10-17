/**
 * Política de caché del service worker. public/sw.js no puede importar
 * TypeScript: repite estas reglas y lib/pwa/cache-policy.test.ts las fija.
 * Nunca se guarda HTML autenticado, RSC, /api/, /auth/ ni un origen cruzado
 * (Supabase). Solo el cascarón offline y los estáticos.
 */

export const STATIC_CACHE = "ember-static-v1";

export type CacheDecision =
  | { action: "bypass" }
  | { action: "navigate" }
  | { action: "cache-first"; cache: typeof STATIC_CACHE };

const STATIC_EXACT = ["/offline.html", "/manifest.webmanifest", "/favicon.ico", "/icon.svg"];
const STATIC_PREFIXES = ["/_next/static/", "/icons/"];

export type CacheInput = {
  method: string;
  url: string;
  /** true si el origen es el de la app. */
  sameOrigin: boolean;
  mode?: string;
  /** Cabecera RSC de Next o ?_rsc. */
  rsc?: boolean;
  /** Cabecera Next-Router-Prefetch. */
  prefetch?: boolean;
};

/** Qué hacer con una petición. bypass no toca la caché. */
export function cacheDecision(input: CacheInput): CacheDecision {
  if (input.method !== "GET") return { action: "bypass" };
  if (!input.sameOrigin) return { action: "bypass" };
  if (input.rsc || input.prefetch) return { action: "bypass" };

  const path = new URL(input.url).pathname;
  if (path.startsWith("/api/") || path.startsWith("/auth/")) return { action: "bypass" };
  if (input.mode === "navigate") return { action: "navigate" };
  if (STATIC_EXACT.includes(path) || STATIC_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return { action: "cache-first", cache: STATIC_CACHE };
  }
  return { action: "bypass" };
}
