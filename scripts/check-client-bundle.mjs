#!/usr/bin/env node
/**
 * Revisa que el bundle del cliente no lleve secretos. Corre después de
 * `next build` (script "build" de package.json), así que en Vercel un
 * secreto en el cliente hace fallar el deploy antes de publicarse.
 *
 * Revisa todo lo que el navegador puede descargar: .next/static (chunks de
 * JavaScript y CSS) y public/ (service worker, offline.html, manifest).
 * Busca el valor real de SUPABASE_SERVICE_ROLE_KEY y de CRON_SECRET (del
 * entorno o de .env.local) y los patrones de scripts/secret-scan.mts.
 * La anon key no cuenta: es pública por diseño.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { findSecrets } from "./secret-scan.mts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIRS = [join(ROOT, ".next/static"), join(ROOT, "public")];

if (!existsSync(join(ROOT, ".next/static"))) {
  console.error("[bundle] No existe .next/static: corre `next build` primero.");
  process.exit(1);
}
if (existsSync(join(ROOT, ".env.local"))) {
  // En local los valores reales están en .env.local; en Vercel, en el entorno.
  for (const name of ["SUPABASE_SERVICE_ROLE_KEY", "CRON_SECRET"]) {
    if (!process.env[name]) {
      const line = readFileSync(join(ROOT, ".env.local"), "utf8")
        .split(/\r?\n/)
        .find((l) => l.startsWith(`${name}=`));
      if (line) process.env[name] = line.slice(name.length + 1).trim();
    }
  }
}
const known = [process.env.SUPABASE_SERVICE_ROLE_KEY, process.env.CRON_SECRET].filter(Boolean);

/** Archivos de texto de una carpeta, recursivo. */
function* files(dir) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (/\.(js|mjs|css|html|json|webmanifest|txt|map)$/.test(name)) yield path;
  }
}

let checked = 0;
const problems = [];
for (const dir of DIRS) {
  for (const path of files(dir)) {
    checked += 1;
    for (const finding of findSecrets(readFileSync(path, "utf8"), known)) {
      problems.push(`${relative(ROOT, path)}: ${finding.kind} (${finding.preview})`);
    }
  }
}

if (problems.length > 0) {
  console.error(
    `[bundle] Hay secretos en archivos que descarga el navegador:\n  ${problems.join("\n  ")}`,
  );
  console.error(
    "[bundle] No publiques esta build. Quita el secreto del código del cliente y rota la llave.",
  );
  process.exit(1);
}
console.log(
  `[bundle] Sin secretos en ${checked} archivos del cliente (${known.length} valores reales comparados).`,
);
