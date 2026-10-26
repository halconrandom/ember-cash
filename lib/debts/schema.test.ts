// Tests de validación de deudas y pagos, y del próximo vencimiento.
import { describe, expect, it } from "vitest";

import { money } from "@/lib/money/money";

import { isDueSoon, nextDueDate } from "./dates";
import { parseAprBps, validateDebt, validatePayment, type DebtInput } from "./schema";

describe("parseAprBps", () => {
  it("acepta coma o punto y hasta 2 decimales", () => {
    expect(parseAprBps("28,5")).toBe(2850);
    expect(parseAprBps("12.4 %")).toBe(1240);
    expect(parseAprBps("0")).toBe(0);
    expect(parseAprBps("200")).toBe(20000);
  });
  it("rechaza lo inválido", () => {
    expect(parseAprBps("1,234")).toBeNull();
    expect(parseAprBps("201")).toBeNull();
    expect(parseAprBps("-3")).toBeNull();
    expect(parseAprBps("")).toBeNull();
  });
});

const debt: DebtInput = {
  id: null,
  name: "Credit Card",
  subtitle: "Sample Bank Visa",
  iconKey: "credit-card",
  currency: "COP",
  principal: "4.900.000",
  apr: "28,5",
  aprKind: "EA",
  minPayment: "320.000",
  dueDay: "22",
};

describe("validateDebt", () => {
  it("acepta una deuda válida", () => {
    expect(validateDebt(debt, "es")).toEqual({
      ok: true,
      value: {
        id: null,
        name: "Credit Card",
        subtitle: "Sample Bank Visa",
        iconKey: "credit-card",
        principal: money(4_900_000n, "COP"),
        aprBps: 2850,
        aprKind: "EA",
        minPayment: money(320_000n, "COP"),
        dueDay: 22,
        balance: null,
        includeInPlan: true,
        paidThisMonth: false,
      },
    });
  });

  it("fuera del plan: por defecto incluida, y se puede excluir", () => {
    expect(validateDebt(debt, "es")).toMatchObject({ ok: true, value: { includeInPlan: true } });
    expect(validateDebt({ ...debt, includeInPlan: false }, "es")).toMatchObject({
      ok: true,
      value: { includeInPlan: false },
    });
  });

  it("el saldo ya incluye el pago del mes: solo al crear", () => {
    expect(validateDebt({ ...debt, paidThisMonth: true }, "es")).toMatchObject({
      ok: true,
      value: { paidThisMonth: true },
    });
    expect(
      validateDebt(
        { ...debt, id: "11111111-1111-4111-8111-111111111111", paidThisMonth: true },
        "es",
      ),
    ).toMatchObject({ ok: true, value: { paidThisMonth: false } });
  });

  describe("saldo actual (pago inicial)", () => {
    it("vacío o ausente = sin pago inicial", () => {
      // `debt` no trae balance: igual que un cliente anterior.
      expect(validateDebt(debt, "es")).toMatchObject({ ok: true, value: { balance: null } });
      expect(validateDebt({ ...debt, balance: "  " }, "es")).toMatchObject({
        ok: true,
        value: { balance: null },
      });
    });

    it("acepta un saldo menor o igual al principal, y 0", () => {
      expect(validateDebt({ ...debt, balance: "2.849.990" }, "es")).toMatchObject({
        ok: true,
        value: { balance: money(2_849_990n, "COP") },
      });
      expect(validateDebt({ ...debt, balance: "4.900.000" }, "es")).toMatchObject({ ok: true });
      expect(validateDebt({ ...debt, balance: "0" }, "es")).toMatchObject({
        ok: true,
        value: { balance: money(0n, "COP") },
      });
    });

    it("rechaza un saldo mayor que el principal o inválido", () => {
      expect(validateDebt({ ...debt, balance: "4.900.001" }, "es")).toEqual({
        ok: false,
        errors: { balance: "balanceTooHigh" },
      });
      expect(validateDebt({ ...debt, balance: "-5" }, "es")).toMatchObject({ ok: false });
    });

    it("al editar descuenta los pagos reales", () => {
      // Principal 4.900.000 con 1.000.000 en pagos reales: saldo máximo 3.900.000.
      expect(validateDebt({ ...debt, balance: "3.900.000" }, "es", 1_000_000n)).toMatchObject({
        ok: true,
      });
      expect(validateDebt({ ...debt, balance: "3.900.001" }, "es", 1_000_000n)).toEqual({
        ok: false,
        errors: { balance: "balanceTooHigh" },
      });
      expect(validateDebt({ ...debt, principal: "900.000" }, "es", 1_000_000n)).toEqual({
        ok: false,
        errors: { principal: "principalBelowPaid" },
      });
    });
  });

  it("errores por campo", () => {
    expect(
      validateDebt(
        { ...debt, name: "", iconKey: "x", principal: "0", apr: "abc", dueDay: "32" },
        "es",
      ),
    ).toEqual({
      ok: false,
      errors: {
        name: "nameRequired",
        iconKey: "iconRequired",
        principal: "amountPositive",
        apr: "aprInvalid",
        dueDay: "dueDayInvalid",
      },
    });
  });

  it("acepta una deuda en EUR (fase E2.1)", () => {
    expect(
      validateDebt({ ...debt, currency: "EUR", principal: "4.900,00", minPayment: "320,00" }, "es"),
    ).toMatchObject({
      ok: true,
      value: {
        principal: money(490_000n, "EUR"),
        minPayment: money(32_000n, "EUR"),
      },
    });
  });
});

describe("validatePayment", () => {
  const base = {
    debtId: "11111111-1111-4111-8111-111111111111",
    currency: "COP" as const,
    amount: "320.000",
    interest: "76.000",
    paidOn: "2026-10-17",
    createTransaction: false,
    accountId: "",
  };

  it("separa interés y capital", () => {
    expect(validatePayment(base, "es", "2026-10-17")).toMatchObject({
      ok: true,
      value: {
        amount: money(320_000n, "COP"),
        interest: money(76_000n, "COP"),
        principal: money(244_000n, "COP"),
        accountId: null,
      },
    });
  });

  it("el interés no puede superar el pago; con transacción hace falta la cuenta", () => {
    expect(validatePayment({ ...base, interest: "400.000" }, "es", "2026-10-17")).toEqual({
      ok: false,
      errors: { interest: "interestTooHigh" },
    });
    expect(validatePayment({ ...base, createTransaction: true }, "es", "2026-10-17")).toEqual({
      ok: false,
      errors: { accountId: "accountRequired" },
    });
    expect(validatePayment({ ...base, paidOn: "2026-10-18" }, "es", "2026-10-17")).toEqual({
      ok: false,
      errors: { paidOn: "dateFuture" },
    });
  });
});

describe("próximo vencimiento", () => {
  it("este mes o el siguiente, ajustado al último día", () => {
    expect(nextDueDate(22, "2026-10-16")).toBe("2026-10-22");
    expect(nextDueDate(3, "2026-10-16")).toBe("2026-11-03");
    expect(nextDueDate(16, "2026-10-16")).toBe("2026-10-16");
    expect(nextDueDate(31, "2027-02-10")).toBe("2027-02-28");
    expect(nextDueDate(31, "2026-12-31")).toBe("2026-12-31");
  });

  it("vence pronto: dentro de 10 días", () => {
    expect(isDueSoon("2026-10-25", "2026-10-16")).toBe(true);
    expect(isDueSoon("2026-10-28", "2026-10-16")).toBe(false);
  });
});
