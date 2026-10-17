// Tests de la regla de estado de las metas (lib/goals/status.ts).
import { describe, expect, it } from "vitest";

import { daysBetween, goalPercent, goalStatus } from "./status";

/** Meta de 1.000.000 del 1 de enero al 31 de diciembre de 2026 (364 días). */
const base = { targetMinor: 1_000_000n, startedOn: "2026-01-01", targetDate: "2026-12-31" };

describe("goalStatus", () => {
  it("al día: lo ahorrado alcanza lo esperado en línea recta", () => {
    // A mitad de camino (182 de 364 días) se esperan 500.000.
    expect(goalStatus({ ...base, savedMinor: 500_000n, today: "2026-07-02" })).toBe("onTrack");
    expect(goalStatus({ ...base, savedMinor: 600_000n, today: "2026-07-02" })).toBe("onTrack");
  });

  it("atrasada: un poco menos de lo esperado", () => {
    expect(goalStatus({ ...base, savedMinor: 499_999n, today: "2026-07-02" })).toBe("behind");
  });

  it("casi lista: 95 % o más, aunque vaya atrasada en el calendario", () => {
    expect(goalStatus({ ...base, savedMinor: 950_000n, today: "2026-12-30" })).toBe("almostThere");
    expect(goalStatus({ ...base, savedMinor: 1_200_000n, today: "2026-03-01" })).toBe(
      "almostThere",
    );
    expect(goalStatus({ ...base, savedMinor: 949_999n, today: "2026-12-31" })).toBe("behind");
  });

  it("antes de empezar se espera 0: al día", () => {
    expect(goalStatus({ ...base, savedMinor: 0n, today: "2025-12-15" })).toBe("onTrack");
  });

  it("fecha objetivo pasada: se espera el 100 %", () => {
    expect(goalStatus({ ...base, savedMinor: 900_000n, today: "2027-02-01" })).toBe("behind");
    expect(goalStatus({ ...base, savedMinor: 960_000n, today: "2027-02-01" })).toBe("almostThere");
  });

  it("sin fecha objetivo no hay atraso", () => {
    expect(goalStatus({ ...base, targetDate: null, savedMinor: 0n, today: "2030-01-01" })).toBe(
      "onTrack",
    );
  });

  it("fecha objetivo igual o anterior al inicio: se espera el 100 %", () => {
    expect(
      goalStatus({ ...base, targetDate: "2026-01-01", savedMinor: 10n, today: "2026-01-01" }),
    ).toBe("behind");
    expect(
      goalStatus({
        ...base,
        targetDate: "2025-06-01",
        savedMinor: 1_000_000n,
        today: "2026-01-01",
      }),
    ).toBe("almostThere");
  });
});

describe("goalPercent y daysBetween", () => {
  it("porcentaje entero al más cercano, entre 0 y 100", () => {
    expect(goalPercent(6_800_000n, 12_000_000n)).toBe(57);
    expect(goalPercent(1_700_000n, 4_900_000n)).toBe(35);
    expect(goalPercent(996n, 1_000n)).toBe(99);
    expect(goalPercent(4n, 1_000n)).toBe(0);
    expect(goalPercent(64_000n, 120_000n)).toBe(53);
    expect(goalPercent(2_000_000n, 1_000_000n)).toBe(100);
    expect(goalPercent(5n, 0n)).toBe(0);
  });

  it("días entre fechas sin depender de la zona horaria", () => {
    expect(daysBetween("2026-01-01", "2026-12-31")).toBe(364);
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
  });
});
