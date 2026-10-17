/**
 * Guardia de la base de pruebas (scripts/db-tests.mjs).
 *
 * Los tests SQL crean usuarios, escriben filas y, en modo --fresh, borran la
 * base entera. Por eso solo se aceptan URL de un Postgres LOCAL:
 * - esquema postgres:// o postgresql://,
 * - host localhost, 127.0.0.1 o ::1,
 * - nombre de base que termine en "_test" (para no borrar otra base local),
 * - nada que mencione supabase (ni el host ni la base ni la consulta).
 * Si algo no cumple, lanza un error que explica qué falta y cómo arreglarlo.
 *
 * Node 24 ejecuta este archivo directamente (quita los tipos), y Vitest lo
 *  prueba en db-test-url.test.ts. Es .mts para que Node lo trate como módulo ES.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export type TestDatabase = {
  /** URL completa de la base de pruebas. */
  url: string;
  /** Nombre de la base (sin la barra). */
  name: string;
  /** Misma URL apuntando a la base "postgres", para borrar y crear la de pruebas. */
  maintenanceUrl: string;
};

const HOW_TO =
  "Define TEST_DATABASE_URL con una base local, por ejemplo:\n" +
  "  TEST_DATABASE_URL=postgresql://localhost:5432/ember_cash_test\n" +
  "(ver README, sección Pruebas de base de datos).";

export function assertLocalTestDatabase(raw: string | undefined): TestDatabase {
  if (!raw || raw.trim() === "") {
    throw new Error(`[db-tests] Falta TEST_DATABASE_URL. ${HOW_TO}`);
  }
  if (/supabase/i.test(raw)) {
    throw new Error(
      "[db-tests] TEST_DATABASE_URL menciona supabase. Los tests nunca corren contra Supabase " +
        `(un solo proyecto, el real). ${HOW_TO}`,
    );
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`[db-tests] TEST_DATABASE_URL no es una URL válida. ${HOW_TO}`);
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error(`[db-tests] TEST_DATABASE_URL debe empezar con postgresql://. ${HOW_TO}`);
  }
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(
      `[db-tests] El host "${url.hostname}" no es local. Solo se aceptan localhost, 127.0.0.1 o ::1. ${HOW_TO}`,
    );
  }
  const name = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!/^[a-z0-9_]+_test$/.test(name)) {
    throw new Error(
      `[db-tests] La base "${name}" debe llamarse con letras, números o _ y terminar en "_test" ` +
        `(la de pruebas se borra y se crea de nuevo). ${HOW_TO}`,
    );
  }
  const maintenance = new URL(url.toString());
  maintenance.pathname = "/postgres";
  return { url: url.toString(), name, maintenanceUrl: maintenance.toString() };
}
