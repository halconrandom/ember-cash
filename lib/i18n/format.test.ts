// Tests de formatos de número y fecha según el idioma (el dinero se prueba en lib/money).
import { describe, expect, it } from "vitest";

import { formatCompactDate, formatDate, formatNumber, formatTime } from "./format";

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
    expect(formatDate("2026-10-17", "en", "long")).toBe("October 17, 2026");
    expect(formatDate("2026-10-17", "es", "long")).toBe("17 de octubre de 2026");
  });
});

describe("zona fija", () => {
  // 03:30 UTC del 21 es 22:30 del 20 en Bogotá. Si se ignora la zona, el día cambia.
  const iso = "2026-10-21T03:30:00.000Z";

  it("el día y la hora siguen la zona pedida, no la del proceso", () => {
    expect(formatDate(iso, "es", "short", "America/Bogota")).toMatch(/20/);
    expect(formatDate(iso, "en", "short", "America/Bogota")).toMatch(/20/);
    expect(formatDate(iso, "es", "short", "UTC")).toMatch(/21/);
    expect(formatDate(iso, "en", "short", "UTC")).toMatch(/21/);
    expect(formatTime(iso, "es", "America/Bogota")).toMatch(/10:30/);
    expect(formatTime(iso, "en", "America/Bogota")).toMatch(/10:30/);
    expect(formatTime(iso, "es", "UTC")).toMatch(/3:30/);
    expect(formatTime(iso, "en", "UTC")).toMatch(/3:30/);
  });

  it("sin zona explícita usa America/Bogota", () => {
    expect(formatDate(iso, "es", "short")).toBe(formatDate(iso, "es", "short", "America/Bogota"));
    expect(formatTime(iso, "es")).toBe(formatTime(iso, "es", "America/Bogota"));
  });
});

describe("formatCompactDate", () => {
  it("día y mes abreviado, sin preposición", () => {
    expect(formatCompactDate("2026-10-17", "es")).toBe("17 oct");
    expect(formatCompactDate("2026-10-17", "en")).toBe("Oct 17");
  });
});
