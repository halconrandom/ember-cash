// Reglas del wizard: moneda, pasos, cuenta, foco, tasa y movimiento.
import { describe, expect, it } from "vitest";

import es from "@/messages/es.json";

import { creditColumns } from "@/lib/accounts/credit";
import type { Rate } from "@/lib/money/convert";

import { firstStepItems } from "./first-steps";
import {
  defaultCurrencyForLocale,
  formatRateText,
  nextChargeDate,
  rateForDisplayCurrency,
  stepMotion,
  subscriptionChipLabels,
  validateAccountForm,
  validateFocusForm,
  wizardStep,
} from "./logic";

const rate = (base: Rate["base"], quote: Rate["quote"], value: string): Rate => ({
  base,
  quote,
  rate: value,
  asOf: "2026-10-20",
  fetchedAt: "2026-10-20T12:00:00Z",
  source: "test",
});

describe("onboarding", () => {
  it("preselecciona COP en español y USD en inglés", () => {
    expect(defaultCurrencyForLocale("es")).toBe("COP");
    expect(defaultCurrencyForLocale("en")).toBe("USD");
  });

  it("retoma el paso guardado y trata null como la bienvenida", () => {
    expect(wizardStep(null)).toBe(0);
    expect(wizardStep(0)).toBe(0);
    expect(wizardStep(2)).toBe(2);
    expect(wizardStep(4)).toBe(0);
  });

  it("muestra la tasa guardada, sin invertirla, o ninguna", () => {
    const rates = [rate("USD", "COP", "4000.0000000000"), rate("EUR", "USD", "1.0800000000")];
    expect(rateForDisplayCurrency("COP", rates)?.rate).toBe("4000.0000000000");
    expect(rateForDisplayCurrency("USD", rates)?.base).toBe("EUR");
    expect(rateForDisplayCurrency("EUR", rates)?.quote).toBe("USD");
    expect(rateForDisplayCurrency("EUR", [rate("USD", "COP", "4000")])).toBeNull();
    expect(formatRateText("4000.5000000000")).toBe("4000.5");
    expect(formatRateText("4000.0000000000")).toBe("4000");
  });

  it("el movimiento reducido solo funde la opacidad", () => {
    expect(stepMotion(false).initial).toEqual({ opacity: 0, y: 16 });
    expect(stepMotion(false).transition.duration).toBe(0.2);
    expect(stepMotion(true).initial).toEqual({ opacity: 0 });
    expect(stepMotion(true).animate).toEqual({ opacity: 1 });
  });

  it("valida la cuenta y exige cupo y día solo en la tarjeta", () => {
    const ok = validateAccountForm(
      { type: "savings", name: " Ahorros ", currency: "COP", balance: "", limit: "", payDay: "" },
      "es",
    );
    expect(ok.ok && ok.value.dbType).toBe("savings");
    const bad = validateAccountForm(
      { type: "credit", name: "", currency: "COP", balance: "abc", limit: "0", payDay: "40" },
      "es",
    );
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.fields.name).toBe("onboarding.account.errors.name");
      expect(bad.fields.balance).toBe("onboarding.account.errors.balance");
      expect(bad.fields.limit).toBe("onboarding.account.errors.limit");
      expect(bad.fields.payDay).toBe("onboarding.account.errors.payDay");
    }
    const card = validateAccountForm(
      {
        type: "wallet",
        name: "Nequi",
        currency: "COP",
        balance: "1000",
        limit: "",
        payDay: "",
      },
      "es",
    );
    expect(card.ok && card.value.dbType).toBe("other");
  });

  it("elige el próximo día de cobro y lo recorta al fin de mes", () => {
    expect(nextChargeDate("2026-10-20", 15)).toBe("2026-11-15");
    expect(nextChargeDate("2026-10-20", 31)).toBe("2026-10-31");
    expect(nextChargeDate("2026-02-20", 31)).toBe("2026-02-28");
  });

  it("valida el foco: meta, deuda con tasa vacía y suscripción", () => {
    const goal = validateFocusForm(
      {
        choice: "savings",
        name: "Viaje",
        target: "1000000",
        current: "",
        date: "",
        balance: "",
        rate: "",
        payment: "",
        dueDay: "",
        amount: "",
        day: "",
        chip: "",
        currency: "COP",
        today: "2026-10-20",
      },
      "es",
    );
    expect(goal.ok && goal.value.choice).toBe("savings");

    const highRate = validateFocusForm(
      {
        choice: "debt",
        name: "Crédito",
        target: "",
        current: "",
        date: "",
        balance: "500000",
        rate: "101",
        payment: "",
        dueDay: "",
        amount: "",
        day: "",
        chip: "",
        currency: "COP",
        today: "2026-10-20",
      },
      "es",
    );
    expect(highRate.ok).toBe(false);
    if (!highRate.ok) expect(highRate.fields.rate).toBe("onboarding.focus.debt.errors.rate");

    const debt = validateFocusForm(
      {
        choice: "debt",
        name: "Crédito",
        target: "",
        current: "",
        date: "",
        balance: "500000",
        rate: "",
        payment: "",
        dueDay: "15",
        amount: "",
        day: "",
        chip: "",
        currency: "COP",
        today: "2026-10-20",
      },
      "es",
    );
    expect(debt.ok && debt.value.choice === "debt" && debt.value.debt.apr).toBe("0");

    const sub = validateFocusForm(
      {
        choice: "subscription",
        name: "Internet",
        target: "",
        current: "",
        date: "",
        balance: "",
        rate: "",
        payment: "",
        dueDay: "",
        amount: "80000",
        day: "3",
        chip: "internet",
        currency: "COP",
        today: "2026-10-20",
      },
      "es",
    );
    expect(sub.ok && sub.value.choice === "subscription" && sub.value.recurring.iconKey).toBe(
      "wifi",
    );
    expect(
      validateFocusForm(
        {
          choice: "",
          name: "",
          target: "",
          current: "",
          date: "",
          balance: "",
          rate: "",
          payment: "",
          dueDay: "",
          amount: "",
          day: "",
          chip: "",
          currency: "COP",
          today: "2026-10-20",
        },
        "es",
      ).ok,
    ).toBe(false);
  });

  it("parte los chips del copy en el orden de la spec", () => {
    expect(subscriptionChipLabels(es.onboarding.focus.sub.chips)).toEqual([
      "Arriendo",
      "Internet",
      "Celular",
      "Gimnasio",
      "Streaming",
    ]);
  });

  it("cuenta los primeros pasos y los marca todos cuando corresponde", () => {
    const open = firstStepItems({
      expense: true,
      goal: false,
      debt: false,
      household: false,
    });
    expect(open.done).toBe(1);
    expect(open.allDone).toBe(false);
    expect(open.items[0]?.href).toBe("/?tx=new");
    const done = firstStepItems({ expense: true, goal: true, debt: true, household: true });
    expect(done.allDone).toBe(true);
  });

  it("solo deja cupo y día en una tarjeta", () => {
    expect(creditColumns("savings", null, null)).toEqual({
      credit_limit_minor: null,
      payment_day: null,
    });
    expect(creditColumns("savings", 100, null)).toBeNull();
    expect(creditColumns("credit_card", 100, 15)).toEqual({
      credit_limit_minor: 100,
      payment_day: 15,
    });
    expect(creditColumns("credit_card", 0, 15)).toBeNull();
  });
});
