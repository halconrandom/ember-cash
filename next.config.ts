import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

import { getServerEnv } from "./lib/env-server";
import { securityHeaders } from "./lib/security/static-headers";

// Valida las variables de entorno al arrancar (`pnpm dev`, `pnpm build`,
// `pnpm start`). Si falta alguna, el proceso se detiene con un mensaje que
// dice cuál falta y cómo crear .env.local, en vez de fallar más tarde.
getServerEnv();

const nextConfig: NextConfig = {
  // Solo en desarrollo: deja que un teléfono en la misma red abra el servidor
  // de `pnpm dev` por la IP del Mac (http://192.168.x.x:3000) o su nombre
  // .local. Sin esto, Next 16 bloquea /_next/hmr para orígenes que no son
  // localhost, el cliente de desarrollo no arranca, React no hidrata y los
  // botones (p. ej. "Continuar con Google") no responden al toque. No afecta
  // a producción. Rangos de red privada (RFC 1918) y mDNS.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*", "*.local"],
  // Sin "X-Powered-By: Next.js": no anunciar el framework (auditoría B-01).
  poweredByHeader: false,
  // Explícito: los source maps del navegador no se publican en producción.
  productionBrowserSourceMaps: false,
  cacheComponents: true,
  partialPrefetching: true,
  // Cabeceras estáticas en todas las rutas. La CSP va en proxy.ts porque
  // lleva un nonce distinto en cada petición.
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders() }];
  },
  turbopack: {
    rules: {
      // Procesa los CSS con Tailwind v4 bajo Turbopack.
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

// next-intl: carga la configuración por petición de i18n/request.ts.
const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

export default withNextIntl(nextConfig);
