// Tests de formatos de número y fecha según el idioma (el dinero se prueba en lib/money).
import { describe, expect, it } from "vitest";

import { formatDate, formatNumber } from "./format";

describe("formatNumber", () => {
  it("usa los separadores del idioma", () => {
    expect(formatNumber(1234, "es")).toBe("1.234");
    expect(formatNumber(1234, "en")).toBe("1,234");
    expect(formatNumber(1599.5, "es", 2)).toBe("1.599,50");
    expect(formatNumber(1599.5, "en", 2)).toBe("1,599.50");
  });
});

describe("formatDate", () => {
  it("formatea según el idioma sin correr el día", () => {
    expect(formatDate("2026-10-16", "en")).toBe("Oct 16");
    expect(formatDate("2026-10-16", "es")).toMatch(/^16 (de )?oct/);
    expect(formatDate("2026-10-01", "en", "monthYear")).toBe("October 2026");
    expect(formatDate("2026-10-01", "es", "monthYear")).toBe("octubre de 2026");
  });
});
