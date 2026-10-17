/**
 * Cabeceras de seguridad que no cambian entre peticiones.
 *
 * next.config.ts las importa al arrancar. Este archivo no usa el alias `@/`
 * ni módulos de la app: el compilador de next.config no resuelve ese alias
 * y el proceso no llega a escuchar.
 */
export type Header = { key: string; value: string };

/**
 * Aplican a todas las respuestas, también a los archivos estáticos (el proxy
 * no corre sobre ellos).
 *
 * HSTS no incluye preload: quitarlo después es lento. En http (localhost)
 * el navegador ignora esta cabecera.
 */
export function securityHeaders(): Header[] {
  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-DNS-Prefetch-Control", value: "off" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    },
    // same-origin-allow-popups: el login con Google abre la cuenta en otra
    // ventana. same-origin a secas rompe ese flujo.
    { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
    { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
    {
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains",
    },
  ];
}
