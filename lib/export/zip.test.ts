// El ZIP del respaldo se puede abrir: firma, nombre y bytes del CSV.
import { describe, expect, it } from "vitest";

import { crc32, zipStore } from "./zip";

function textOf(bytes: Uint8Array, start: number, length: number): string {
  return new TextDecoder().decode(bytes.slice(start, start + length));
}

describe("zipStore", () => {
  it("guarda un CSV sin compresión", () => {
    const payload = new TextEncoder().encode("id,amount_minor\n1,25000\n");
    const zip = zipStore(
      [{ name: "transactions.csv", data: payload }],
      new Date("2026-10-17T13:00:00Z"),
    );

    expect(zip[0]).toBe(0x50);
    expect(zip[1]).toBe(0x4b);
    const nameLength = zip[26] | (zip[27] << 8);
    expect(textOf(zip, 30, nameLength)).toBe("transactions.csv");
    const dataStart = 30 + nameLength;
    expect(textOf(zip, dataStart, payload.length)).toBe("id,amount_minor\n1,25000\n");
    const storedCrc = zip[14] | (zip[15] << 8) | (zip[16] << 16) | (zip[17] << 24);
    expect(storedCrc >>> 0).toBe(crc32(payload));
  });

  it("rechaza un nombre con carpeta", () => {
    expect(() => zipStore([{ name: "a/b.csv", data: new Uint8Array() }])).toThrow(/inválido/);
  });
});
