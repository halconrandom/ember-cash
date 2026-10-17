import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

import { getServerEnv } from "./lib/env";

// Valida las variables de entorno al arrancar (`pnpm dev`, `pnpm build`,
// `pnpm start`). Si falta alguna, el proceso se detiene con un mensaje que
// dice cuál falta y cómo crear .env.local, en vez de fallar más tarde.
getServerEnv();

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
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
