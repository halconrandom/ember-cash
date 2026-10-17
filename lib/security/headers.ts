/**
 * CSP con nonce por petición (proxy.ts) y el hash del script de tema e
 * idioma, que es estático y va en el <head>.
 *
 * Las cabeceras que no cambian viven en static-headers.ts: next.config las
 * carga al arrancar y ese compilador no resuelve el alias `@/`.
 *
 * El script de arranque no lleva nonce: su hash está en la CSP, así que puede
 * seguir en el HTML estático y el tema no parpadea. Los scripts de Next
 * reciben el nonce porque la CSP viaja en la petición.
 */
import { createHash } from "node:crypto";

import { LOCALE_SCRIPT } from "@/lib/i18n/config";
import { THEME_SCRIPT } from "@/lib/theme/constants";

export { securityHeaders, type Header } from "./static-headers";

/** Script inline del <head>: tema y lang antes del primer pintado. */
export const BOOT_SCRIPT = THEME_SCRIPT + LOCALE_SCRIPT;

/** Hash sha256 en base64, el formato que pide script-src. */
export function bootScriptHash(): string {
  return createHash("sha256").update(BOOT_SCRIPT, "utf8").digest("base64");
}

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
 * CSP de una petición.
 *
 * script-src no usa 'unsafe-inline': el arranque entra por hash y Next por
 * nonce. style-src sí lleva 'unsafe-inline' porque motion y React escriben
 * el atributo style en el cliente; un nonce no cubre eso.
 * upgrade-insecure-requests solo en producción: en local rompería http.
 */
export function contentSecurityPolicy(options: {
  nonce: string;
  isDev: boolean;
  supabaseUrl: string;
}): string {
  const script = [
    "'self'",
    `'nonce-${options.nonce}'`,
    `'sha256-${bootScriptHash()}'`,
    "'strict-dynamic'",
    options.isDev ? "'unsafe-eval'" : "",
  ]
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
