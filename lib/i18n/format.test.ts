// Tests de formatos: separadores según el idioma y decimales según la moneda.
import { describe, expect, it } from "vitest";

import { formatAmount, formatDate, formatMoney, formatNumber } from "./format";

const NBSP = " ";

describe("formatNumber", () => {
  it("usa los separadores del idioma", () => {
    expect(formatNumber(1234, "es")).toBe("1.234");
    expect(formatNumber(1234, "en")).toBe("1,234");
    expect(formatNumber(1599.5, "es", 2)).toBe("1.599,50");
    expect(formatNumber(1599.5, "en", 2)).toBe("1,599.50");
  });
});

describe("formatMoney", () => {
  it("COP nunca lleva decimales, en ningún idioma", () => {
    expect(formatMoney(125000, "COP", "es")).toBe(`125.000${NBSP}COP`);
    expect(formatMoney(125000, "COP", "en")).toBe(`125,000${NBSP}COP`);
    expect(formatAmount(89900, "COP", "en")).toBe("89,900");
  });

  it("USD siempre lleva 2 decimales y US$ delante", () => {
    expect(formatMoney(1599, "USD", "en")).toBe(`US$${NBSP}15.99`);
    expect(formatMoney(1599, "USD", "es")).toBe(`US$${NBSP}15,99`);
    expect(formatMoney(84000, "USD", "en")).toBe(`US$${NBSP}840.00`);
  });

  it("con unidad 'code' (modal) el código va detrás", () => {
    expect(formatMoney(3125, "USD", "en", { unit: "code" })).toBe(`31.25${NBSP}USD`);
  });

  it("negativos, aproximados y montos de 12 dígitos sin perder precisión", () => {
    expect(formatMoney(-18500, "COP", "en")).toBe(`-18,500${NBSP}COP`);
    expect(formatMoney(230000, "USD", "en", { approx: true })).toBe(`≈${NBSP}US$${NBSP}2,300.00`);
    expect(formatMoney(999999999999, "COP", "es")).toBe(`999.999.999.999${NBSP}COP`);
    expect(formatMoney(0, "USD", "es")).toBe(`US$${NBSP}0,00`);
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
