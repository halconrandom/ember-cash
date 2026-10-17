// La spec fija 12 px como tamaño mínimo de texto. Este test busca en el código
// tamaños arbitrarios de Tailwind (text-[11px], text-[0.6rem]) y font-size en
// CSS por debajo de 12 px.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOTS = ["app", "components"];
const MIN_PX = 12;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(tsx?|css)$/.test(name) && !name.endsWith(".test.ts") ? [path] : [];
  });
}

/** Convierte "11px" o "0.6875rem" a px (1rem = 16px). */
function toPx(value: number, unit: string): number {
  return unit === "rem" || unit === "em" ? value * 16 : value;
}

describe("tamaño mínimo de texto", () => {
  it(`no hay texto por debajo de ${MIN_PX} px`, () => {
    const offenders: string[] = [];
    for (const file of ROOTS.flatMap(files)) {
      const src = readFileSync(file, "utf8");
      const patterns = [
        /text-\[(\d*\.?\d+)(px|rem|em)\]/g,
        /font-size:\s*(\d*\.?\d+)(px|rem|em)/g,
        /--text-[a-z0-9]+(?:-[a-z0-9]+)*:\s*(\d*\.?\d+)(px|rem|em)\s*;/g,
      ];
      for (const re of patterns) {
        for (const m of src.matchAll(re)) {
          if (toPx(Number(m[1]), m[2]) < MIN_PX) offenders.push(`${file}: ${m[0]}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
