// El producto no trae una tasa fija ni filas de ejemplo. Los 4000 de los
// tests y la galería /dev/design-system no cuentan: esa ruta no existe en
// producción.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else out.push(path);
  }
  return out;
}

describe("sin tasa fija en el producto", () => {
  it("app, components y lib no incrustan la tasa de ejemplo", () => {
    const roots = ["app", "components", "lib"].map((dir) => join(ROOT, dir));
    const files = roots.flatMap(walk).filter((path) => {
      const rel = relative(ROOT, path);
      return (
        (path.endsWith(".ts") || path.endsWith(".tsx")) &&
        !rel.includes(".test.") &&
        !rel.startsWith("app/dev/")
      );
    });
    const forbidden = /source:\s*["']sample["']|rate:\s*["']4000["']/;
    const hits = files.filter((path) => forbidden.test(readFileSync(path, "utf8")));
    expect(hits.map((path) => relative(ROOT, path))).toEqual([]);
  });
});
