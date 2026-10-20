// Tests de validación de metas y aportes.
import { describe, expect, it } from "vitest";

import { money } from "@/lib/money/money";

import { validateContribution, validateGoal, type GoalInput } from "./schema";

const today = "2026-10-17";
const goal: GoalInput = {
  id: null,
  name: "Trip fund",
  iconKey: "plane",
  target: "5.000.000",
  currency: "COP",
  targetDate: "2027-06-30",
  monthly: "450.000",
};

describe("validateGoal", () => {
  it("acepta una meta válida", () => {
    expect(validateGoal(goal, "es", today)).toEqual({
      ok: true,
      value: {
        id: null,
        name: "Trip fund",
        iconKey: "plane",
        target: money(5_000_000n, "COP"),
        targetDate: "2027-06-30",
        monthly: money(450_000n, "COP"),
      },
    });
  });

  it("aporte mensual y fecha son opcionales", () => {
    expect(validateGoal({ ...goal, monthly: "", targetDate: "" }, "es", today)).toMatchObject({
      ok: true,
      value: { monthly: null, targetDate: null },
    });
  });

  it("errores por campo", () => {
    expect(
      validateGoal(
        { ...goal, name: " ", iconKey: "bomba", target: "0", monthly: "1,5" },
        "es",
        today,
      ),
    ).toEqual({
      ok: false,
      errors: {
        name: "nameRequired",
        iconKey: "iconRequired",
        target: "amountPositive",
        monthly: "amountTooManyDecimals",
      },
    });
  });

  it("acepta una meta en EUR (fase E2.1)", () => {
    expect(
      validateGoal({ ...goal, currency: "EUR", target: "1.200,50", monthly: "80" }, "es", today),
    ).toMatchObject({
      ok: true,
      value: { target: money(120_050n, "EUR"), monthly: money(8000n, "EUR") },
    });
  });

  it("USD con 2 decimales y fecha pasada solo al editar", () => {
    expect(
      validateGoal({ ...goal, currency: "USD", target: "1,200.50", monthly: "80" }, "en", today),
    ).toMatchObject({
      ok: true,
      value: { target: money(120_050n, "USD"), monthly: money(8000n, "USD") },
    });
    expect(validateGoal({ ...goal, targetDate: "2026-01-01" }, "es", today)).toEqual({
      ok: false,
      errors: { targetDate: "datePast" },
    });
    expect(
      validateGoal(
        { ...goal, id: "11111111-1111-4111-8111-111111111111", targetDate: "2026-01-01" },
        "es",
        today,
      ).ok,
    ).toBe(true);
  });
});

describe("validateContribution", () => {
  const base = {
    goalId: "11111111-1111-4111-8111-111111111111",
    amount: "100.000",
    currency: "COP" as const,
    contributedOn: today,
    transactionId: null,
  };

  it("acepta un aporte válido y descarta un id de transacción raro", () => {
    expect(validateContribution({ ...base, transactionId: "no-uuid" }, "es", today)).toEqual({
      ok: true,
      value: {
        goalId: base.goalId,
        amount: money(100_000n, "COP"),
        contributedOn: today,
        transactionId: null,
      },
    });
  });

  it("monto mayor que 0 y fecha no futura (no hay retiros)", () => {
    expect(validateContribution({ ...base, amount: "-5" }, "es", today)).toEqual({
      ok: false,
      errors: { amount: "amountPositive" },
    });
    expect(validateContribution({ ...base, contributedOn: "2026-10-18" }, "es", today)).toEqual({
      ok: false,
      errors: { contributedOn: "dateFuture" },
    });
  });
});
