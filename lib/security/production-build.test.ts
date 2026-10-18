// B-01 y los source maps: quedan fijados en la configuración de producción.
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("next.config de producción", () => {
  const source = readFileSync("next.config.ts", "utf8");

  it("no anuncia el framework y no publica source maps del navegador", () => {
    expect(source).toContain("poweredByHeader: false");
    expect(source).toContain("productionBrowserSourceMaps: false");
  });
});
