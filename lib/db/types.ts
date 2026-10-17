/**
 * Tipos de la base de datos para el resto de la app.
 *
 * - `database.types.ts` lo genera la CLI de Supabase (`pnpm db:types`); no se
 *   edita a mano.
 * - Este archivo re-exporta lo generado y agrega:
 *   1. Alias cortos por tabla (Transaction, Account, ...).
 *   2. Uniones literales para las columnas con CHECK (la CLI las tipa como
 *      `string`). Deben coincidir con los CHECK de las migraciones.
 *   3. Versiones "estrechas" de las filas, con esas uniones aplicadas.
 */
import type { Database, Json, Tables, TablesInsert, TablesUpdate } from "./database.types";

export type { Database, Json, Tables, TablesInsert, TablesUpdate };

// -----------------------------------------------------------------------------
// Valores permitidos (espejo de los CHECK y de los datos sembrados en SQL)
// -----------------------------------------------------------------------------

/** Monedas sembradas en `currencies` (0003_finance_model.sql). */
export const CURRENCY_CODES = ["COP", "USD"] as const;
export type CurrencyCode = (typeof CURRENCY_CODES)[number];

/** Decimales de la unidad menor por moneda (columna currencies.exponent). */
export const CURRENCY_EXPONENT: Record<CurrencyCode, number> = { COP: 0, USD: 2 };

/** Categorías de gasto sembradas, en su orden (`sort`). */
export const EXPENSE_CATEGORY_KEYS = [
  "housing",
  "food",
  "transport",
  "subscriptions",
  "health",
  "leisure",
  "other",
] as const;
/** Categorías de ingreso sembradas, en su orden (`sort`). */
export const INCOME_CATEGORY_KEYS = ["salary", "other_income"] as const;

export type ExpenseCategoryKey = (typeof EXPENSE_CATEGORY_KEYS)[number];
export type IncomeCategoryKey = (typeof INCOME_CATEGORY_KEYS)[number];
export type CategoryKey = ExpenseCategoryKey | IncomeCategoryKey;
export type CategoryKind = "expense" | "income";

export type AccountType = "checking" | "savings" | "credit_card" | "cash" | "other";
export type TransactionKind = "expense" | "income" | "transfer";
export type AprKind = "EA" | "nominal";
export type RecurringKind = "subscription" | "bill" | "income" | "debt_payment";
export type RecurringFrequency = "weekly" | "monthly" | "yearly";
export type RecurringStatus = "active" | "paused" | "cancelled";
export type OccurrenceStatus = "scheduled" | "paid" | "skipped";
export type HouseholdRole = "owner" | "member";
export type Theme = "system" | "light" | "dark";

// -----------------------------------------------------------------------------
// Filas con las uniones aplicadas
// -----------------------------------------------------------------------------

/** Reemplaza el tipo de algunas columnas de una fila generada. */
type Narrow<Row, Overrides> = Omit<Row, keyof Overrides> & Overrides;

export type Currency = Narrow<Tables<"currencies">, { code: CurrencyCode }>;
export type Category = Narrow<Tables<"categories">, { key: CategoryKey; kind: CategoryKind }>;
export type ExchangeRate = Narrow<
  Tables<"exchange_rates">,
  { base: CurrencyCode; quote: CurrencyCode }
>;

export type Profile = Narrow<Tables<"profiles">, { display_currency: CurrencyCode; theme: Theme }>;
export type Household = Tables<"households">;
export type HouseholdMember = Narrow<Tables<"household_members">, { role: HouseholdRole }>;

export type Account = Narrow<Tables<"accounts">, { type: AccountType; currency: CurrencyCode }>;

export type Transaction = Narrow<
  Tables<"transactions">,
  { kind: TransactionKind; category_key: CategoryKey | null; currency: CurrencyCode }
>;
export type TransactionSplit = Tables<"transaction_splits">;

export type Goal = Narrow<Tables<"goals">, { currency: CurrencyCode }>;
export type GoalContribution = Narrow<Tables<"goal_contributions">, { currency: CurrencyCode }>;

export type Debt = Narrow<Tables<"debts">, { currency: CurrencyCode; apr_kind: AprKind }>;
export type DebtPayment = Tables<"debt_payments">;

export type RecurringItem = Narrow<
  Tables<"recurring_items">,
  {
    kind: RecurringKind;
    category_key: CategoryKey | null;
    currency: CurrencyCode;
    frequency: RecurringFrequency;
    status: RecurringStatus;
  }
>;
export type RecurringOccurrence = Narrow<
  Tables<"recurring_occurrences">,
  { status: OccurrenceStatus }
>;

export type Budget = Narrow<
  Tables<"budgets">,
  { category_key: CategoryKey; currency: CurrencyCode }
>;
export type Settlement = Narrow<Tables<"settlements">, { currency: CurrencyCode }>;
