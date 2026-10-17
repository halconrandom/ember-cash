#!/usr/bin/env node
/**
 * Activa los hooks de .githooks (pre-commit de secretos). Lo llama el script
 * "prepare" de package.json al hacer `pnpm install`. Si no hay repositorio de
 * git (por ejemplo, en el build de Vercel), no hace nada y no falla.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
if (existsSync(join(ROOT, ".git"))) {
  spawnSync("git", ["config", "core.hooksPath", ".githooks"], { cwd: ROOT, stdio: "ignore" });
}
