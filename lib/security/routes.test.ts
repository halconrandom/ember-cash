// Ninguna ruta entrega datos de finanzas sin sesión, y el cliente no ve secretos.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { isPublicPath } from "@/lib/supabase/proxy";

const ROOT = process.cwd();

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

/** Rutas que responden sin sesión y no leen finanzas. */
const PUBLIC_ROUTES = new Set([
  "app/.well-known/security.txt/route.ts",
  "app/api/health/route.ts",
  "app/auth/callback/route.ts",
  "app/auth/confirm/route.ts",
  "app/auth/signout/route.ts",
]);

describe("rutas", () => {
  const routes = walk(join(ROOT, "app"))
    .filter((path) => path.endsWith("route.ts"))
    .map((path) => relative(ROOT, path));

  it("las públicas no consultan tablas ni la service role", () => {
    for (const route of routes.filter((path) => PUBLIC_ROUTES.has(path))) {
      const source = readFileSync(join(ROOT, route), "utf8");
      expect(source, route).not.toContain("createAdminClient");
      expect(source, route).not.toContain(".from(");
      expect(source, route).not.toContain("SERVICE_ROLE");
    }
  });

  it("los cron exigen el secreto y el resto de las rutas exige sesión", () => {
    for (const route of routes) {
      if (PUBLIC_ROUTES.has(route)) continue;
      const source = readFileSync(join(ROOT, route), "utf8");
      if (route.includes("/api/cron/")) {
        expect(source, route).toContain("if (!authorized(");
      } else {
        expect(source, route).toMatch(/requireUser\(|getCurrentUser\(/);
        expect(source, route).not.toContain("createAdminClient");
      }
    }
  });

  it("el respaldo no es una ruta pública del proxy", () => {
    expect(isPublicPath("/settings/export")).toBe(false);
    expect(isPublicPath("/settings/export", "production")).toBe(false);
  });
});

describe("server actions", () => {
  it("comprueban la sesión antes de tocar datos", () => {
    const files = ["app", "components", "lib"]
      .flatMap((dir) => walk(join(ROOT, dir)))
      .filter(
        (path) => (path.endsWith(".ts") || path.endsWith(".tsx")) && !path.includes(".test."),
      );
    const actions = files.filter((path) => readFileSync(path, "utf8").startsWith('"use server"'));
    expect(actions.length).toBeGreaterThan(0);
    for (const path of actions) {
      const source = readFileSync(path, "utf8");
      expect(source, relative(ROOT, path)).toMatch(/requireUser\(|getCurrentUser\(/);
    }
  });
});

describe("páginas", () => {
  it("fuera del grupo con sesión solo están login, los textos legales, offline y el design system", () => {
    const pages = walk(join(ROOT, "app"))
      .filter((path) => path.endsWith("page.tsx"))
      .map((path) => relative(ROOT, path));
    const open = pages.filter((path) => !path.startsWith("app/(app)/"));
    expect(open.sort()).toEqual([
      "app/dev/design-system/page.tsx",
      "app/login/page.tsx",
      "app/offline/page.tsx",
      "app/privacidad/page.tsx",
      "app/terminos/page.tsx",
    ]);
    for (const file of ["app/privacidad/page.tsx", "app/terminos/page.tsx"]) {
      const source = readFileSync(join(ROOT, file), "utf8");
      expect(source, file).not.toMatch(/requireUser\(|getCurrentUser\(/);
    }
    expect(readFileSync(join(ROOT, "app/login/page.tsx"), "utf8")).toContain("LegalFooter");
    expect(readFileSync(join(ROOT, "app/(app)/(shell)/settings/page.tsx"), "utf8")).toContain(
      "LegalFooter",
    );
    const design = readFileSync(join(ROOT, "app/dev/design-system/page.tsx"), "utf8");
    expect(design).toContain('process.env.NODE_ENV === "production"');
    expect(design).toContain("notFound(");
  });
});

function specifiers(source: string): string[] {
  const withoutTypeImports = source.replace(/import\s+type\s+[\s\S]*?from\s+["'][^"']+["'];?/g, "");
  const found: string[] = [];
  for (const match of withoutTypeImports.matchAll(/from\s+["']([^"']+)["']/g)) {
    found.push(match[1] ?? "");
  }
  for (const match of withoutTypeImports.matchAll(/import\s+["']([^"']+)["']/g)) {
    found.push(match[1] ?? "");
  }
  return found;
}

function resolveSpecifier(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = join(dirname(from), spec);
  else return null;
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.mts`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ];
  return candidates.find((path) => existsSync(path) && statSync(path).isFile()) ?? null;
}

describe("secretos en el cliente", () => {
  it("el grafo de los componentes de cliente no llega a la service role ni al cron", () => {
    const files = ["app", "components", "lib"]
      .flatMap((dir) => walk(join(ROOT, dir)))
      .filter(
        (path) => (path.endsWith(".ts") || path.endsWith(".tsx")) && !path.includes(".test."),
      );
    const entries = files.filter((path) => {
      if (path.endsWith(`${join("lib", "supabase", "client.ts")}`)) return true;
      const head = readFileSync(path, "utf8").slice(0, 400);
      return head.includes('"use client"');
    });

    const seen = new Set<string>();
    const queue = [...entries];
    while (queue.length > 0) {
      const path = queue.pop();
      if (!path || seen.has(path)) continue;
      seen.add(path);
      const source = readFileSync(path, "utf8");
      const boundary = source.startsWith('"use server"') || source.includes('from "server-only"');
      if (boundary && !entries.includes(path)) {
        // Una server action es un borde: el cliente recibe un stub, no el código.
        if (source.includes('from "server-only"') && entries.includes(path)) {
          throw new Error(`${relative(ROOT, path)} es de cliente e importa server-only`);
        }
        continue;
      }
      expect(source, relative(ROOT, path)).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
      expect(source, relative(ROOT, path)).not.toContain("CRON_SECRET");
      expect(source, relative(ROOT, path)).not.toContain("createAdminClient");
      for (const spec of specifiers(source)) {
        const next = resolveSpecifier(path, spec);
        if (!next || seen.has(next)) continue;
        const nextSource = readFileSync(next, "utf8");
        if (nextSource.startsWith('"use server"')) continue;
        if (
          nextSource.includes('from "server-only"') ||
          nextSource.includes('import "server-only"')
        ) {
          throw new Error(
            `${relative(ROOT, path)} importa ${relative(ROOT, next)}, que es solo de servidor`,
          );
        }
        queue.push(next);
      }
    }
  });
});
