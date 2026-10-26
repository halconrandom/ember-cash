// Tests de lib/db/types.ts: comprueban en tiempo de compilación (expectTypeOf)
// que los tipos generados tienen las tablas esperadas y que las filas
// "estrechas" usan las uniones literales.
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  CURRENCY_CODES,
  CURRENCY_EXPONENT,
  EXPENSE_CATEGORY_KEYS,
  INCOME_CATEGORY_KEYS,
  type Database,
  type Transaction,
  type TransactionKind,
} from "./types";

describe("lib/db/types", () => {
  it("expone todas las tablas del modelo", () => {
    type TableName = keyof Database["public"]["Tables"];
    expectTypeOf<
      | "currencies"
      | "categories"
      | "exchange_rates"
      | "accounts"
      | "transactions"
      | "transaction_splits"
      | "goals"
      | "goal_contributions"
      | "debts"
      | "debt_payments"
      | "recurring_items"
      | "recurring_occurrences"
      | "budgets"
      | "settlements"
      | "events"
    >().toExtend<TableName>();
  });

  it("los importes son number (bigint llega como número) y kind es una unión", () => {
    expectTypeOf<Transaction["amount_minor"]>().toEqualTypeOf<number>();
    expectTypeOf<Transaction["kind"]>().toEqualTypeOf<TransactionKind>();
  });

  it("las constantes coinciden con lo sembrado en SQL", () => {
    expect(CURRENCY_CODES).toEqual(["COP", "USD", "EUR", "ARS", "MXN"]);
    expect(CURRENCY_EXPONENT).toEqual({ COP: 0, USD: 2, EUR: 2, ARS: 2, MXN: 2 });
    expect(EXPENSE_CATEGORY_KEYS).toHaveLength(8); // 0032: card_payment
    expect(INCOME_CATEGORY_KEYS).toEqual(["salary", "other_income"]);
  });
});
