// Test de la elección de la tasa más reciente.
import { describe, expect, it } from "vitest";

import { pickLatest } from "./rates";

const row = (as_of: string, source: string, rate: number, fetched_at = `${as_of}T13:00:00Z`) => ({
  base: "USD",
  quote: "COP",
  rate,
  as_of,
  fetched_at,
  source,
});

describe("pickLatest", () => {
  it("sin filas devuelve null", () => {
    expect(pickLatest([])).toBeNull();
  });

  it("elige la vigencia más reciente y, a igual fecha, la TRM", () => {
    const latest = pickLatest([
      row("2026-10-16", "datos.gov.co", 3170.46),
      row("2026-10-17", "open.er-api.com", 3182.78, "2026-10-17T14:00:00Z"),
      row("2026-10-17", "datos.gov.co", 3174.67),
    ]);
    expect(latest).toMatchObject({ rate: "3174.67", asOf: "2026-10-17", source: "datos.gov.co" });
  });

  it("si solo hay respaldo para la fecha más reciente, usa el respaldo", () => {
    expect(
      pickLatest([
        row("2026-10-16", "datos.gov.co", 3170.46),
        row("2026-10-17", "open.er-api.com", 3182.78),
      ])?.source,
    ).toBe("open.er-api.com");
  });
});
