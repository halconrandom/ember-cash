// Configuración de Vitest. Resuelve el alias "@/..." igual que tsconfig.json.
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    // "server-only" lanza un error fuera de React Server Components.
    alias: { "server-only": new URL("./test/server-only.ts", import.meta.url).pathname },
  },
  test: {
    environment: "node",
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next"],
    setupFiles: ["./vitest.setup.ts"],
    // Valores falsos para que los módulos que validan el entorno se puedan
    // importar en los tests sin un .env.local. No son secretos reales.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
      NEXT_PUBLIC_CONTACT_EMAIL: "contacto@example.com",
      SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
      CRON_SECRET: "test-cron-secret-not-real-0000000000",
    },
  },
});
