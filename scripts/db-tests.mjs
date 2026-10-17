#!/usr/bin/env node
/**
 * Corre los tests SQL de supabase/tests contra un Postgres LOCAL de pruebas.
 * Nunca usa la CLI de Supabase ni se conecta al proyecto real (hay uno solo
 * y es el de producción; ver A-01 en docs/security/AUDIT.md).
 *
 *   pnpm test:rls        crea de nuevo la base de pruebas, aplica
 *                        local-bootstrap.sql y todas las migraciones, y
 *                        corre cada archivo de tests por separado.
 *   pnpm test:db:fresh   igual, pero corre todos los tests juntos en una sola
 *                        transacción (detecta tests que se pisan entre sí).
 *
 * La base sale de TEST_DATABASE_URL (variable de entorno o .env.local). Solo
 * se acepta un host local y un nombre que termine en "_test"
 * (scripts/db-test-url.mts); si no, el script se detiene antes de conectarse.
 * Solo se borra esa base. Necesita psql en el PATH (o en la ruta de Homebrew
 * o del instalador de Windows; o la variable PSQL con la ruta).
 *
 * Un archivo pasa si psql termina sin error y la salida contiene "OK:". Si
 * un test lanza "FALLO: ..." o hay un error de SQL, el script termina con 1.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { assertLocalTestDatabase } from "./db-test-url.mts";

// fileURLToPath: en Windows, URL.pathname daría "/C:/..." y no serviría como ruta.
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MIGRATIONS = join(ROOT, "supabase/migrations");
const TESTS = join(ROOT, "supabase/tests");
const BOOTSTRAP = join(TESTS, "local-bootstrap.sql");

// TEST_DATABASE_URL desde el entorno o, si no está, desde .env.local.
if (!process.env.TEST_DATABASE_URL && existsSync(join(ROOT, ".env.local"))) {
  process.loadEnvFile(join(ROOT, ".env.local"));
}
let db;
try {
  db = assertLocalTestDatabase(process.env.TEST_DATABASE_URL);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

/** Ruta de psql: PSQL, el PATH, Homebrew (Apple Silicon e Intel) o Windows. */
function findPsql() {
  if (process.env.PSQL) return process.env.PSQL;
  const candidates = [
    "/opt/homebrew/opt/postgresql@17/bin/psql",
    "/usr/local/opt/postgresql@17/bin/psql",
    "C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe",
  ];
  const inPath = spawnSync(process.platform === "win32" ? "where" : "which", ["psql"], {
    encoding: "utf8",
  });
  if (inPath.status === 0 && inPath.stdout.trim()) return inPath.stdout.trim().split(/\r?\n/)[0];
  const found = candidates.find((path) => existsSync(path));
  if (found) return found;
  console.error(
    "[db-tests] No se encontró psql. Instala PostgreSQL 17 (ver README) o define PSQL con la ruta.",
  );
  process.exit(1);
}
const PSQL = findPsql();

/** Archivos .sql de una carpeta, ordenados por nombre (sin el bootstrap). */
const sqlFiles = (dir) =>
  readdirSync(dir)
    .filter((f) => f.endsWith(".sql") && join(dir, f) !== BOOTSTRAP)
    .sort()
    .map((f) => join(dir, f));

/** Corre psql y devuelve { ok, output }. Se detiene en el primer error. */
function psql(url, args) {
  const res = spawnSync(PSQL, ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", url, ...args], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return { ok: res.status === 0, output: `${res.stdout ?? ""}${res.stderr ?? ""}` };
}

/** Borra y crea de nuevo SOLO la base de pruebas, y le aplica el bootstrap y las migraciones. */
function prepareDatabase() {
  const quoted = `"${db.name}"`;
  for (const sql of [
    `drop database if exists ${quoted} with (force)`,
    `create database ${quoted}`,
  ]) {
    const res = psql(db.maintenanceUrl, ["-c", sql]);
    if (!res.ok) {
      console.error(`[db-tests] No se pudo preparar ${db.name}:\n${res.output}`);
      process.exit(1);
    }
  }
  for (const file of [BOOTSTRAP, ...sqlFiles(MIGRATIONS)]) {
    const res = psql(db.url, ["-f", file]);
    if (!res.ok) {
      console.error(`FALLA ${file.replace(ROOT, "")} (al aplicar):\n${res.output}`);
      process.exit(1);
    }
  }
  console.log(`Base ${db.name}: bootstrap y ${sqlFiles(MIGRATIONS).length} migraciones aplicadas.`);
}

/** Muestra el resultado de un archivo y dice si pasó. */
function report(label, { ok, output }) {
  // La última línea "OK:" (en --fresh, la del conjunto, no la del primer archivo).
  const okLine = output.match(/OK:[^\n]*/g)?.at(-1);
  if (ok && okLine && !/FALLO/.test(output)) {
    console.log(`PASA  ${label}: ${okLine.trim()}`);
    return true;
  }
  const fallo = output.match(/FALLO[^\n]*/) ?? output.match(/ERROR:[^\n]*/);
  console.error(`FALLA ${label}: ${fallo ? fallo[0] : output.slice(0, 2000)}`);
  return false;
}

/** Todos los tests juntos en una transacción (cada archivo trae su BEGIN/ROLLBACK). */
function buildCombinedScript() {
  const strip = (sql) => sql.replace(/^\s*(begin|rollback);\s*$/gim, "");
  const parts = [
    "begin;",
    ...sqlFiles(TESTS).map(
      (f) => `-- tests ${f.replace(ROOT, "")}\n${strip(readFileSync(f, "utf8"))}`,
    ),
    "select 'OK: todos los tests juntos en una transacción' as resultado;",
    "rollback;",
  ];
  const file = join(mkdtempSync(join(tmpdir(), "ember-db-")), "fresh.sql");
  writeFileSync(file, parts.join("\n\n"));
  return file;
}

prepareDatabase();
let allOk = true;
if (process.argv.includes("--fresh")) {
  allOk = report(
    "migraciones desde cero + todos los tests",
    psql(db.url, ["-f", buildCombinedScript()]),
  );
} else {
  for (const file of sqlFiles(TESTS)) {
    allOk = report(file.replace(ROOT, ""), psql(db.url, ["-f", file])) && allOk;
  }
}
process.exit(allOk ? 0 : 1);
