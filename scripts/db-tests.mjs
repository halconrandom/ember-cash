#!/usr/bin/env node
/**
 * Corre los tests SQL de supabase/tests contra el proyecto enlazado con la CLI
 * de Supabase (Management API; no necesita Docker ni psql).
 *
 *   node scripts/db-tests.mjs           corre cada archivo de tests por separado
 *   node scripts/db-tests.mjs --fresh   aplica TODAS las migraciones desde cero
 *                                       y luego todos los tests, en una sola
 *                                       transacción que termina en ROLLBACK
 *
 * Cada archivo de tests ya trae su propio BEGIN/ROLLBACK, así que nada queda
 * guardado. Un test pasa si la salida contiene "OK:"; si contiene "FALLO" o
 * un error, el script termina con código 1.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const MIGRATIONS = join(ROOT, "supabase/migrations");
const TESTS = join(ROOT, "supabase/tests");

/** Archivos .sql de una carpeta, ordenados por nombre. */
const sqlFiles = (dir) =>
  readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => join(dir, f));

/** Ejecuta un archivo SQL con la CLI y devuelve la salida combinada. */
function runSqlFile(file) {
  const res = spawnSync("pnpm", ["exec", "supabase", "db", "query", "--linked", "-f", file], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return `${res.stdout ?? ""}${res.stderr ?? ""}`;
}

/** Muestra el resultado de un archivo y dice si pasó. */
function report(label, output) {
  const ok = output.match(/OK:[^"\\]*/);
  if (ok && !/FALLO|"_tag":"Error"/.test(output)) {
    console.log(`PASA  ${label}: ${ok[0].trim()}`);
    return true;
  }
  const fallo = output.match(/FALLO[^"\\]*/) ?? output.match(/ERROR:[^"\\]*/);
  console.error(`FALLA ${label}: ${fallo ? fallo[0] : output.slice(0, 2000)}`);
  return false;
}

/**
 * Prepara un script que, dentro de una transacción, borra lo que crearon las
 * migraciones en public (tablas, funciones y el trigger de auth.users),
 * vuelve a aplicar todas las migraciones y corre todos los tests.
 */
function buildFreshScript() {
  const strip = (sql) => sql.replace(/^\s*(begin|rollback);\s*$/gim, "");
  const parts = [
    "begin;",
    `-- Deja public como en un proyecto nuevo (solo dentro de esta transacción).
do $$
declare r record;
begin
  drop trigger if exists on_auth_user_created on auth.users;
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('drop table public.%I cascade', r.tablename);
  end loop;
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname <> 'rls_auto_enable'  -- función propia de Supabase
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('drop function %s cascade', r.sig);
  end loop;
end $$;`,
    ...sqlFiles(MIGRATIONS).map((f) => `-- migración ${f}\n${readFileSync(f, "utf8")}`),
    ...sqlFiles(TESTS).map((f) => `-- tests ${f}\n${strip(readFileSync(f, "utf8"))}`),
    "select 'OK: migraciones desde cero y tests' as resultado;",
    "rollback;",
  ];
  const dir = mkdtempSync(join(tmpdir(), "ember-db-"));
  const file = join(dir, "fresh.sql");
  writeFileSync(file, parts.join("\n\n"));
  return file;
}

let allOk = true;
if (process.argv.includes("--fresh")) {
  allOk = report("migraciones desde cero + tests", runSqlFile(buildFreshScript()));
} else {
  for (const file of sqlFiles(TESTS)) {
    allOk = report(file.replace(ROOT, ""), runSqlFile(file)) && allOk;
  }
}
process.exit(allOk ? 0 : 1);
