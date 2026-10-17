#!/usr/bin/env node
/**
 * pnpm db:push. Aplica las migraciones al proyecto enlazado solo después de
 * escribir su ref. No usa el seed.
 */
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

import { ROOT, isPushConfirmed, readLinkedProjectRef } from "./db-guard.mjs";

const ref = readLinkedProjectRef();
if (!ref) {
  console.error("No hay un proyecto enlazado en supabase/.temp/project-ref. No se aplicó nada.");
  process.exit(1);
}

console.log(`Las migraciones se aplican al proyecto ${ref}.`);
console.log("Ese proyecto es el de desarrollo y el de producción.");

if (!stdin.isTTY) {
  console.error("pnpm db:push pide el ref en una terminal. No se aplicó nada.");
  process.exit(1);
}

const rl = createInterface({ input: stdin, output: stdout });
const answer = await rl.question(`Escribe ${ref} para continuar: `);
rl.close();

if (!isPushConfirmed(answer, ref)) {
  console.error("El ref no coincide. No se aplicó nada.");
  process.exit(1);
}

const result = spawnSync("pnpm", ["exec", "supabase", "db", "push", "--linked", "--yes"], {
  cwd: ROOT,
  stdio: "inherit",
});
process.exit(result.status ?? 1);
