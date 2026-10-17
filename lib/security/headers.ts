/**
 * CSP de la app (la aplica proxy.ts en cada respuesta).
 *
 * Sin nonce (desde 0.14.2): con cacheComponents, Next prerenderiza el
 * esqueleto de cada página en el build (Partial Prerendering), y esos
 * <script> no pueden llevar el nonce de una petición que todavía no existe.
 * Con nonce + 'strict-dynamic' el navegador los bloqueaba, React no hidrataba
 * y ningún botón respondía en producción. La guía de CSP de Next 16 lo
 * documenta: "PPR is incompatible with nonce-based CSP". Para páginas
 * prerenderizadas recomienda script-src 'self' 'unsafe-inline'.
 *
 * Las cabeceras que no cambian viven en static-headers.ts: next.config las
 * carga al arrancar y ese compilador no resuelve el alias `@/`.
 */
import { LOCALE_SCRIPT } from "@/lib/i18n/config";
import { THEME_SCRIPT } from "@/lib/theme/constants";

export { securityHeaders, type Header } from "./static-headers";

/** Script inline del <head>: tema y lang antes del primer pintado. */
export const BOOT_SCRIPT = THEME_SCRIPT + LOCALE_SCRIPT;

/** Orígenes de connect-src para la URL de Supabase de esta instalación. */
function supabaseConnectSources(supabaseUrl: string): string[] {
  const sources = ["'self'", "https://*.supabase.co", "wss://*.supabase.co"];
  try {
    const url = new URL(supabaseUrl);
    const ws = url.protocol === "https:" ? "wss:" : "ws:";
    sources.push(url.origin, `${ws}//${url.host}`);
  } catch {
    // getPublicEnv ya exige una URL. Si no lo fuera, quedan los comodines.
  }
  return [...new Set(sources)];
}

/**
 * CSP.
 *
 * script-src: 'self' y 'unsafe-inline', sin nonce ni hash. Ojo: si se agrega
 * un nonce o un hash, el navegador ignora 'unsafe-inline' y vuelve a bloquear
 * los scripts en línea del esqueleto prerenderizado (el arranque de Turbopack,
 * el script de tema). El resto sigue cerrado: object-src 'none', base-uri,
 * frame-ancestors, form-action y connect-src solo a Supabase.
 * style-src lleva 'unsafe-inline' porque motion y React escriben el atributo
 * style en el cliente.
 * upgrade-insecure-requests solo en producción: en local rompería http.
 */
export function contentSecurityPolicy(options: { isDev: boolean; supabaseUrl: string }): string {
  const script = ["'self'", "'unsafe-inline'", options.isDev ? "'unsafe-eval'" : ""]
    .filter(Boolean)
    .join(" ");

  const directives = [
    "default-src 'self'",
    `script-src ${script}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://*.googleusercontent.com",
    "font-src 'self' data:",
    `connect-src ${supabaseConnectSources(options.supabaseUrl).join(" ")}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    options.isDev ? "" : "upgrade-insecure-requests",
  ];
  return directives.filter(Boolean).join("; ");
}
