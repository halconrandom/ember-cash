// Tests del registro de íconos: cada nombre existe en Uicons y tiene su
// equivalente en lucide-react, así el cambio de proveedor no rompe pantallas.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

import { ICONS, SOLID_ICONS } from "./icon-registry";

const require = createRequire(import.meta.url);
const regularCss = readFileSync(
  require.resolve("@flaticon/flaticon-uicons/css/regular/rounded.css"),
  "utf8",
);
const solidCss = readFileSync(
  require.resolve("@flaticon/flaticon-uicons/css/solid/rounded.css"),
  "utf8",
);

describe("icon registry", () => {
  it("todos los íconos regulares existen en Uicons regular rounded", () => {
    const missing = Object.values(ICONS)
      .map((e) => e.uicon)
      .filter((n) => !regularCss.includes(`.fi-rr-${n}:before`));
    expect(missing).toEqual([]);
  });

  it("todos los íconos sólidos existen en Uicons solid rounded", () => {
    const missing = Object.values(SOLID_ICONS)
      .map((e) => e.uicon)
      .filter((n) => !solidCss.includes(`.fi-sr-${n}:before`));
    expect(missing).toEqual([]);
  });

  it("todos tienen un componente de lucide-react", () => {
    for (const entry of [...Object.values(ICONS), ...Object.values(SOLID_ICONS)]) {
      expect(entry.lucide, entry.uicon).toBeTruthy();
    }
  });
});
