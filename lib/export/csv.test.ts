// CSV del respaldo: comillas, montos exactos y celdas que Excel leería como fórmula.
import { describe, expect, it } from "vitest";

import { neutralizeCell, parseCsv, serializeCsv } from "./csv";

describe("parseCsv", () => {
  it("respeta comillas, comas y saltos de línea", () => {
    const rows = parseCsv('id,note\n"1","línea 1\nlínea 2, con coma"\n"2","dice ""hola"""\n');
    expect(rows).toEqual([
      ["id", "note"],
      ["1", "línea 1\nlínea 2, con coma"],
      ["2", 'dice "hola"'],
    ]);
  });
});

describe("neutralizeCell", () => {
  it("deja los enteros de unidades menores como están", () => {
    expect(neutralizeCell("25000")).toBe("25000");
    expect(neutralizeCell("-15")).toBe("-15");
    expect(neutralizeCell("3174.67")).toBe("3174.67");
  });

  it("marca como texto lo que Excel ejecutaría", () => {
    expect(neutralizeCell("=1+1")).toBe("'=1+1");
    expect(neutralizeCell("+cmd")).toBe("'+cmd");
    expect(neutralizeCell("@suma")).toBe("'@suma");
  });
});

describe("serializeCsv", () => {
  it("no altera el encabezado y escapa la nota", () => {
    const csv = serializeCsv([
      ["amount_minor", "description"],
      ["25000", "=hola"],
      ["10", 'dice "x"'],
    ]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(parseCsv(csv)).toEqual([
      ["amount_minor", "description"],
      ["25000", "'=hola"],
      ["10", 'dice "x"'],
    ]);
  });
});
