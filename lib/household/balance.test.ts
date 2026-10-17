// Tests del balance del hogar (lib/household/balance.ts).
import { describe, expect, it } from "vitest";

import type { Rate } from "@/lib/money/convert";
import { money } from "@/lib/money/money";

import {
  balancesByCurrency,
  fullSettlement,
  isSettled,
  netsIn,
  transfersFor,
  type SharedExpense,
} from "./balance";

const A = "isaac";
const B = "sofia";
const C = "tercero";
const RATE: Rate = {
  base: "USD",
  quote: "COP",
  rate: "4000",
  asOf: "2026-10-16",
  fetchedAt: "2026-10-16T13:00:00Z",
  source: "test",
};

/** Gasto repartido 50/50 (el residuo, al primero), como hace save_transaction. */
function half(paidBy: string, minor: bigint, currency: "COP" | "USD" = "COP"): SharedExpense {
  const first = minor / 2n + (minor % 2n);
  return {
    paidBy,
    amount: money(minor, currency),
    splits: [
      { userId: A, share: money(first, currency) },
      { userId: B, share: money(minor - first, currency) },
    ],
  };
}

describe("balance entre dos miembros", () => {
  it("los gastos del frame: Sofía le debe 190.000 a Isaac", () => {
    // Isaac pagó 2.090.000 y Sofía 1.710.000, todo 50/50.
    const expenses = [
      half(A, 1_800_000n),
      half(A, 186_000n),
      half(A, 63_960n),
      half(A, 40_040n),
      half(B, 86_400n),
      half(B, 142_000n),
      half(B, 89_900n),
      half(B, 1_391_700n),
    ];
    const b = balancesByCurrency(expenses);
    expect(b.COP).toEqual({ [A]: 190_000n, [B]: -190_000n });
    expect(transfersFor(netsIn(b, [A, B], "COP", null)!)).toEqual([
      { from: B, to: A, amount: money(190_000n, "COP") },
    ]);
  });

  it("montos impares: el residuo no se pierde y los netos suman 0", () => {
    const b = balancesByCurrency([half(A, 1_001n), half(B, 333n)]);
    expect(b.COP![A] + b.COP![B]).toBe(0n);
    // A pagó 1.001 y le tocan 501 + 167; B pagó 333 y le tocan 500 + 166.
    expect(b.COP).toEqual({ [A]: 333n, [B]: -333n });
  });

  it("si ambos pagan lo mismo, nadie debe", () => {
    const b = balancesByCurrency([half(A, 100_000n), half(B, 100_000n)]);
    expect(isSettled(b)).toBe(true);
    expect(transfersFor(netsIn(b, [A, B], "COP", null)!)).toEqual([]);
  });

  it("un gasto no compartido con el otro (anterior a su ingreso) no genera deuda", () => {
    const solo: SharedExpense = {
      paidBy: A,
      amount: money(50_000n, "COP"),
      splits: [{ userId: A, share: money(50_000n, "COP") }],
    };
    expect(isSettled(balancesByCurrency([solo]))).toBe(true);
  });
});

describe("ingresos compartidos", () => {
  it("quien recibe el ingreso le debe la mitad al otro", () => {
    const refund = { ...half(A, 80_000n), income: true };
    const b = balancesByCurrency([half(A, 100_000n), refund]);
    // Gasto: A +50.000. Ingreso: A −40.000. Neto: B le debe 10.000 a A.
    expect(b.COP).toEqual({ [A]: 10_000n, [B]: -10_000n });
  });
});

describe("monedas mezcladas", () => {
  // Isaac pagó US$ 100,00 y Sofía 200.000 COP, ambos 50/50.
  const expenses = [half(A, 10_000n, "USD"), half(B, 200_000n, "COP")];

  it("se lleva por moneda", () => {
    expect(balancesByCurrency(expenses)).toEqual({
      USD: { [A]: 5_000n, [B]: -5_000n },
      COP: { [B]: 100_000n, [A]: -100_000n },
    });
  });

  it("en COP con tasa 4.000: Sofía debe 200.000 − 100.000 = 100.000", () => {
    const nets = netsIn(balancesByCurrency(expenses), [A, B], "COP", RATE)!;
    expect(nets).toEqual({ [A]: money(100_000n, "COP"), [B]: money(-100_000n, "COP") });
    expect(transfersFor(nets)).toEqual([{ from: B, to: A, amount: money(100_000n, "COP") }]);
  });

  it("en USD: US$ 25,00", () => {
    const nets = netsIn(balancesByCurrency(expenses), [A, B], "USD", RATE)!;
    expect(transfersFor(nets)).toEqual([{ from: B, to: A, amount: money(2_500n, "USD") }]);
  });

  it("sin tasa no se puede sumar: null", () => {
    expect(netsIn(balancesByCurrency(expenses), [A, B], "COP", null)).toBeNull();
  });
});

describe("liquidaciones", () => {
  const expenses = [half(A, 10_000n, "USD"), half(B, 200_000n, "COP"), half(A, 1_000_000n)];

  it("liquidación total por moneda: queda en 0 con cualquier tasa", () => {
    const b = balancesByCurrency(expenses);
    const plan = fullSettlement(b);
    expect(plan).toEqual([
      { from: B, to: A, amount: money(5_000n, "USD") },
      { from: B, to: A, amount: money(400_000n, "COP") },
    ]);
    const after = balancesByCurrency(
      expenses,
      plan.map((t) => ({ fromUser: t.from, toUser: t.to, amount: t.amount })),
    );
    expect(isSettled(after)).toBe(true);
    const otherRate = { ...RATE, rate: "3174.67" };
    expect(netsIn(after, [A, B], "COP", otherRate)).toEqual({
      [A]: money(0n, "COP"),
      [B]: money(0n, "COP"),
    });
  });

  it("liquidación parcial en la moneda elegida: baja la deuda sin anularla", () => {
    // Deuda total en COP: 5.000 centavos × 40 = 200.000 + 400.000 = 600.000.
    const partial = [{ fromUser: B, toUser: A, amount: money(250_000n, "COP") }];
    const nets = netsIn(balancesByCurrency(expenses, partial), [A, B], "COP", RATE)!;
    expect(nets[B]).toEqual(money(-350_000n, "COP"));
    expect(transfersFor(nets)).toEqual([{ from: B, to: A, amount: money(350_000n, "COP") }]);
  });

  it("pagar de más invierte la deuda", () => {
    const over = [{ fromUser: B, toUser: A, amount: money(700_000n, "COP") }];
    const nets = netsIn(balancesByCurrency(expenses, over), [A, B], "COP", RATE)!;
    expect(transfersFor(nets)).toEqual([{ from: A, to: B, amount: money(100_000n, "COP") }]);
  });
});

describe("tres miembros", () => {
  it("transferencias mínimas", () => {
    // A pagó 300 para los tres (100 c/u); B pagó 60 para los tres (20 c/u).
    const e: SharedExpense[] = [
      {
        paidBy: A,
        amount: money(300n, "COP"),
        splits: [A, B, C].map((u) => ({ userId: u, share: money(100n, "COP") })),
      },
      {
        paidBy: B,
        amount: money(60n, "COP"),
        splits: [A, B, C].map((u) => ({ userId: u, share: money(20n, "COP") })),
      },
    ];
    const nets = netsIn(balancesByCurrency(e), [A, B, C], "COP", null)!;
    // A: 300 − 120 = 180; B: 60 − 120 = −60; C: −120.
    expect(transfersFor(nets)).toEqual([
      { from: C, to: A, amount: money(120n, "COP") },
      { from: B, to: A, amount: money(60n, "COP") },
    ]);
  });
});
