// Las rutas y la exportación no devuelven el objeto de error ni lo imprimen entero.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

function filesUnder(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) filesUnder(path, acc);
    else if (
      /\.(ts|tsx)$/.test(name) &&
      !name.endsWith(".test.ts") &&
      !name.endsWith(".test.tsx")
    ) {
      acc.push(path);
    }
  }
  return acc;
}

describe("errores hacia el cliente", () => {
  it("los cron y el webhook de Telegram registran con el logger y no devuelven el error", () => {
    for (const path of [
      "app/api/cron/rates/route.ts",
      "app/api/cron/occurrences/route.ts",
      "app/api/cron/purge-deleted/route.ts",
      "app/api/telegram/webhook/route.ts",
    ]) {
      const source = readFileSync(path, "utf8");
      expect(source).toContain("logServerError");
      expect(source).not.toMatch(/error:\s*[\w.]+\.message/);
      expect(source).not.toContain("details:");
    }
  });

  it("exportación y dashboard no hacen console.error del objeto", () => {
    for (const path of [
      "app/(app)/(shell)/settings/export/route.ts",
      "app/(app)/(shell)/_dashboard/slots.tsx",
    ]) {
      const source = readFileSync(path, "utf8");
      expect(source).toContain("logServerError");
      expect(source).not.toContain("console.error");
    }
  });

  it("app y lib no imprimen el error como segundo argumento", () => {
    // El segundo argumento tiene que ser el identificador `error`. El logger
    // (lib/log/server.ts) sí llama a console.error, pero con un resumen: esa
    // llamada no cuenta como imprimir el objeto.
    const raw = /console\.error\(\s*(?:(['"`])[^'"`]*\1\s*,\s*)?error\s*\)/;
    const hits: string[] = [];
    for (const path of [...filesUnder("app"), ...filesUnder("lib")]) {
      if (path === "lib/log/server.ts") continue;
      const source = readFileSync(path, "utf8");
      if (raw.test(source)) hits.push(path);
    }
    expect(hits).toEqual([]);
  });
});
