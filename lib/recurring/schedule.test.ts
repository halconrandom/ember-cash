// Fechas de recurrencia: fin de mes, bisiestos, pausa, cancelación y zona horaria.
import { describe, expect, it } from "vitest";

import {
  datesToInsert,
  firstDueOnOrAfter,
  occurrenceDates,
  occurrenceHorizon,
  rescheduleUpdate,
  type ScheduleInput,
} from "./schedule";

function item(overrides: Partial<ScheduleInput> = {}): ScheduleInput {
  return {
    frequency: "monthly",
    interval: 1,
    anchorDate: "2026-01-31",
    endsOn: null,
    status: "active",
    ...overrides,
  };
}

describe("fin de mes", () => {
  it("un mensual anclado al 31 cae el último día de los meses cortos y vuelve al 31", () => {
    expect(occurrenceDates(item(), "2026-01-01", "2026-04-30")).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });

  it("en un año bisiesto, el 31 de enero cae el 29 de febrero", () => {
    expect(occurrenceDates(item({ anchorDate: "2024-01-31" }), "2024-01-01", "2024-03-31")).toEqual(
      ["2024-01-31", "2024-02-29", "2024-03-31"],
    );
  });

  it("un anual anclado al 29 de febrero cae el 28 fuera de bisiesto y vuelve el 29", () => {
    expect(
      occurrenceDates(
        item({ frequency: "yearly", anchorDate: "2024-02-29" }),
        "2024-02-29",
        "2028-03-01",
      ),
    ).toEqual(["2024-02-29", "2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29"]);
  });

  it("ends_on es inclusive y el intervalo salta meses", () => {
    expect(occurrenceDates(item({ endsOn: "2026-03-15" }), "2026-01-01", "2026-12-31")).toEqual([
      "2026-01-31",
      "2026-02-28",
    ]);
    expect(
      occurrenceDates(item({ interval: 2, anchorDate: "2026-01-15" }), "2026-01-01", "2026-07-01"),
    ).toEqual(["2026-01-15", "2026-03-15", "2026-05-15"]);
  });

  it("semanal suma semanas por el intervalo", () => {
    expect(
      occurrenceDates(
        item({ frequency: "weekly", interval: 2, anchorDate: "2026-10-16" }),
        "2026-10-16",
        "2026-11-13",
      ),
    ).toEqual(["2026-10-16", "2026-10-30", "2026-11-13"]);
  });
});

describe("pausar y cancelar", () => {
  it("no genera fechas", () => {
    expect(occurrenceDates(item({ status: "paused" }), "2026-01-01", "2026-04-30")).toEqual([]);
    expect(occurrenceDates(item({ status: "cancelled" }), "2026-01-01", "2026-04-30")).toEqual([]);
  });
});

describe("zona horaria", () => {
  it("a las 02:30 UTC sigue siendo el 16 de octubre en Bogotá y ya es 17 en UTC", () => {
    const now = new Date("2026-10-17T02:30:00.000Z");
    expect(occurrenceHorizon(now, "America/Bogota")).toEqual({
      from: "2026-10-16",
      until: "2027-01-14",
    });
    expect(occurrenceHorizon(now, "UTC").from).toBe("2026-10-17");
  });
});

describe("materializar sin duplicar", () => {
  it("no reinserta una fecha movida (rescheduled_from) ni una que ya existe", () => {
    expect(
      datesToInsert(
        ["2026-10-16", "2026-11-16"],
        [{ dueOn: "2026-10-18", rescheduledFrom: "2026-10-16" }],
      ),
    ).toEqual(["2026-11-16"]);
  });
});

describe("reprogramar una ocurrencia", () => {
  it("guarda la fecha original y, al volver, la limpia", () => {
    const moved = rescheduleUpdate({ dueOn: "2026-10-16", rescheduledFrom: null }, "2026-10-18");
    expect(moved).toEqual({
      dueOn: "2026-10-18",
      rescheduledFrom: "2026-10-16",
      abandon: "2026-10-16",
    });
    expect(rescheduleUpdate(moved, "2026-10-20")).toMatchObject({
      dueOn: "2026-10-20",
      rescheduledFrom: "2026-10-16",
      abandon: "2026-10-18",
    });
    expect(rescheduleUpdate(moved, "2026-10-16")).toEqual({
      dueOn: "2026-10-16",
      rescheduledFrom: null,
      abandon: "2026-10-18",
    });
  });
});

describe("primer vencimiento de una deuda", () => {
  it("usa el día de pago de este mes, o el del siguiente si ya pasó", () => {
    expect(firstDueOnOrAfter("2026-01-15", 31)).toBe("2026-01-31");
    expect(firstDueOnOrAfter("2026-01-31", 15)).toBe("2026-02-15");
    expect(firstDueOnOrAfter("2026-02-01", 31)).toBe("2026-02-28");
  });
});
