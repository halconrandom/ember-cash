// Tests del estado visible de un vencimiento (lib/recurring/state.ts).
import { describe, expect, it } from "vitest";

import { needsAction, occurrenceState } from "./state";

describe("occurrenceState", () => {
  const today = "2026-10-17";
  it("hoy: Por pagar", () => {
    expect(occurrenceState("scheduled", today, today)).toBe("due");
  });
  it("fecha pasada sin confirmar: Vencida, aunque el cron no haya corrido", () => {
    expect(occurrenceState("scheduled", "2026-10-16", today)).toBe("overdue");
  });
  it("marcada como vencida por el cron", () => {
    expect(occurrenceState("overdue", "2026-10-01", today)).toBe("overdue");
  });
  it("futura: próxima, sin acción destacada", () => {
    expect(occurrenceState("scheduled", "2026-10-20", today)).toBe("upcoming");
    expect(needsAction("upcoming")).toBe(false);
    expect(needsAction("due")).toBe(true);
    expect(needsAction("overdue")).toBe(true);
  });
});
