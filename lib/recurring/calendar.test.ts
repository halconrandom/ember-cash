// Grilla del mes y los tres tipos de cargo.
import { describe, expect, it } from "vitest";

import { calendarKind, hiddenCount, monthGrid, type CalendarEvent } from "./calendar";
import { occurrenceDates } from "./schedule";

describe("tipos del calendario", () => {
  it("separa pago por vencer, día de cobro y recurrente", () => {
    expect(calendarKind("bill")).toBe("payment_due");
    expect(calendarKind("debt_payment")).toBe("payment_due");
    expect(calendarKind("income")).toBe("payday");
    expect(calendarKind("subscription")).toBe("recurring");
  });
});

describe("grilla de octubre 2026", () => {
  it("empieza en lunes y una suscripción mensual del 16 aparece ese día", () => {
    const due = occurrenceDates(
      {
        frequency: "monthly",
        interval: 1,
        anchorDate: "2026-10-16",
        endsOn: null,
        status: "active",
      },
      "2026-10-01",
      "2026-10-31",
    );
    const events: CalendarEvent[] = due.map((date) => ({
      occurrenceId: date,
      name: "Nube",
      dueOn: date,
      calendarKind: "recurring",
    }));
    const cells = monthGrid("2026-10", events);
    expect(cells[0]?.date).toBe("2026-09-28");
    expect(cells.at(-1)?.date).toBe("2026-11-01");
    expect(cells).toHaveLength(35);
    const day = cells.find((cell) => cell.date === "2026-10-16");
    expect(day?.inMonth).toBe(true);
    expect(day?.events.map((event) => event.name)).toEqual(["Nube"]);
  });

  it("con 4 eventos muestra +2 más", () => {
    expect(hiddenCount(4)).toBe(2);
    expect(hiddenCount(2)).toBe(0);
  });
});
