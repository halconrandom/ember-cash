// Tests de validación del formulario de recurrente (fase E2.1: admite EUR).
import { describe, expect, it } from "vitest";

import { money } from "@/lib/money/money";

import { validateRecurring, type RecurringInput } from "./schema";

const base: RecurringInput = {
  id: null,
  kind: "subscription",
  name: "Streaming",
  subtitle: "",
  iconKey: "play",
  amount: "9,99",
  currency: "EUR",
  categoryKey: "subscriptions",
  frequency: "monthly",
  interval: "1",
  anchorDate: "2026-10-17",
  endsOn: "",
};

describe("validateRecurring", () => {
  it("acepta un recurrente en EUR", () => {
    expect(validateRecurring(base, "es")).toMatchObject({
      ok: true,
      value: { amount: money(999n, "EUR") },
    });
  });

  it("sigue aceptando COP y USD", () => {
    expect(validateRecurring({ ...base, currency: "COP", amount: "9.990" }, "es")).toMatchObject({
      ok: true,
      value: { amount: money(9990n, "COP") },
    });
    expect(validateRecurring({ ...base, currency: "USD", amount: "9.99" }, "en")).toMatchObject({
      ok: true,
      value: { amount: money(999n, "USD") },
    });
  });
});
