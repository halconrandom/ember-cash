import { describe, expect, it } from "vitest";

import { money } from "@/lib/money/money";
import type { TransactionRow } from "@/lib/transactions/queries";

import { accountFigures, recentByAccount } from "./statement-math";

const BANK = { id: "bank", name: "Banco de Bogotá", type: "savings" as const };
const CARD = { id: "card", name: "Tarjeta de Credito Clasica", type: "credit_card" as const };

function row(id: string, over: Partial<TransactionRow>): TransactionRow {
  return {
    id,
    kind: "expense",
    categoryKey: "food",
    description: id,
    note: null,
    amount: money(1000, "COP"),
    occurredOn: "2026-10-20",
    paidBy: null,
    account: BANK,
    transferTo: null,
    ...over,
  };
}

describe("accountFigures", () => {
  it("cuenta: el saldo tal cual, aunque sea negativo", () => {
    expect(accountFigures("savings", 1_500_000, "COP", null)).toEqual({
      kind: "cash",
      balance: money(1_500_000, "COP"),
    });
    expect(accountFigures("checking", -20, "COP", null)).toMatchObject({
      balance: money(-20, "COP"),
    });
  });

  it("tarjeta: deuda y disponible, nunca un saldo positivo", () => {
    expect(accountFigures("credit_card", 4_214_351, "COP", 4_700_000)).toEqual({
      kind: "card",
      debt: money(4_214_351, "COP"),
      limit: money(4_700_000, "COP"),
      available: money(485_649, "COP"),
    });
    // Saldo a favor: deuda 0, disponible no pasa de lo que da el cupo.
    expect(accountFigures("credit_card", -100, "COP", 1000)).toMatchObject({
      debt: money(0, "COP"),
      available: money(1100, "COP"),
    });
    expect(accountFigures("credit_card", 500, "COP", null)).toMatchObject({
      limit: null,
      available: null,
    });
  });
});

describe("recentByAccount", () => {
  it("una transferencia sale en la cuenta de origen y en la de destino", () => {
    const pay = row("pay", {
      kind: "transfer",
      categoryKey: null,
      account: BANK,
      transferTo: CARD,
    });
    const out = recentByAccount([pay, row("cafe", {})], ["bank", "card"], 10);
    expect(out.bank.map((r) => r.id)).toEqual(["pay", "cafe"]);
    expect(out.card.map((r) => r.id)).toEqual(["pay"]);
  });

  it("respeta el límite por cuenta", () => {
    const rows = [row("a", {}), row("b", {}), row("c", {})];
    expect(recentByAccount(rows, ["bank"], 2).bank).toHaveLength(2);
  });
});
