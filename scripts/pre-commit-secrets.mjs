#!/usr/bin/env node
/**
 * Hook de pre-commit (.githooks/pre-commit): frena el commit si lo que está
 * en el área de preparación lleva un secreto.
 *
 * - Bloquea archivos .env* (salvo .env.example), *.pem, *.key, *.p12 y *.pfx.
 * - Revisa solo las líneas agregadas (git diff --cached) con
 *   scripts/secret-scan.mts y con los valores reales de .env.local.
 *
 * Para saltarlo en un caso justificado: git commit --no-verify (y explica por qué).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { findSecrets } from "./secret-scan.mts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const git = (args) => spawnSync("git", args, { cwd: ROOT, encoding: "utf8" }).stdout ?? "";

const BLOCKED = /(^|\/)(\.env(?!\.example$)[^/]*|[^/]+\.(pem|key|p12|pfx))$/;

/** Valores reales de .env.local para compararlos tal cual (nunca se imprimen). */
function knownSecrets() {
  const file = join(ROOT, ".env.local");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter((line) => /^(SUPABASE_SERVICE_ROLE_KEY|CRON_SECRET)=/.test(line))
    .map((line) => line.slice(line.indexOf("=") + 1).trim())
    .filter(Boolean);
}

const staged = git(["diff", "--cached", "--name-only", "--diff-filter=ACMR"])
  .split("\n")
  .filter(Boolean);
const problems = staged
  .filter((path) => BLOCKED.test(path))
  .map((path) => `${path}: archivo de secretos`);

const known = knownSecrets();
let current = "";
for (const line of git(["diff", "--cached", "-U0", "--no-color"]).split("\n")) {
  if (line.startsWith("+++ b/")) current = line.slice(6);
  else if (line.startsWith("+") && !line.startsWith("+++")) {
    for (const finding of findSecrets(line.slice(1), known)) {
      problems.push(`${current}: ${finding.kind} (${finding.preview})`);
    }
  }
}

if (problems.length > 0) {
  console.error(`[pre-commit] El commit lleva secretos:\n  ${[...new Set(problems)].join("\n  ")}`);
  console.error("[pre-commit] Sácalos del área de preparación (git restore --staged <archivo>).");
  process.exit(1);
}
