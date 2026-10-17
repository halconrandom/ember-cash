// Frontera servidor/cliente (auditoría, fase 1): ningún archivo "use client"
// importa los módulos que tocan la service role o las variables secretas, y
// esos módulos se protegen con "server-only".
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SERVER_ONLY_MODULES = [
  "@/lib/env-server",
  "@/lib/supabase/admin",
  "@/lib/supabase/server",
  "@/lib/money/rates",
  "@/lib/recurring/cron",
];

/** Archivos .ts y .tsx de app, components y lib (sin tests). */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const files = ["app", "components", "lib"].flatMap((dir) => sourceFiles(join(ROOT, dir)));

describe("frontera servidor/cliente", () => {
  it('ningún archivo "use client" importa módulos de servidor', () => {
    const offenders: string[] = [];
    for (const path of files) {
      const source = readFileSync(path, "utf8");
      if (!/^\s*["']use client["']/.test(source)) continue;
      for (const serverModule of SERVER_ONLY_MODULES) {
        if (source.includes(`from "${serverModule}"`))
          offenders.push(`${relative(ROOT, path)} -> ${serverModule}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('el cliente admin (service role) importa "server-only"', () => {
    const admin = readFileSync(join(ROOT, "lib/supabase/admin.ts"), "utf8");
    expect(admin).toMatch(/^import "server-only";/m);
  });

  it("nadie lee process.env.SUPABASE_SERVICE_ROLE_KEY directo (todo pasa por getServerEnv)", () => {
    const readers = files
      .filter((path) =>
        readFileSync(path, "utf8").includes("process.env.SUPABASE_SERVICE_ROLE_KEY"),
      )
      .map((path) => relative(ROOT, path));
    expect(readers).toEqual([]);
  });
});
