/**
 * Cuentas visibles en el scope actual (RLS ya limita a lo del usuario).
 * - Personal: cuentas personales.
 * - Hogar: cuentas del hogar y, además, las personales del usuario (una
 *   compra compartida se puede pagar desde una cuenta propia).
 */
import "server-only";

import type { Account, AccountType, CurrencyCode } from "@/lib/db/types";
import type { Scope } from "@/lib/scope/constants";
import { createClient } from "@/lib/supabase/server";

export type AccountSummary = Pick<
  Account,
  "id" | "name" | "type" | "currency" | "archived_at" | "household_id"
> &
  Partial<Pick<Account, "credit_limit_minor" | "payment_day">>;

export async function getAccounts(
  scope: Scope,
  { includeArchived = false } = {},
): Promise<AccountSummary[]> {
  const supabase = await createClient();
  let query = supabase
    .from("accounts")
    .select("id, name, type, currency, archived_at, household_id, credit_limit_minor, payment_day")
    .order("name");
  query =
    scope.kind === "personal"
      ? query.is("household_id", null)
      : query.or(`household_id.is.null,household_id.eq.${scope.householdId}`);
  if (!includeArchived) query = query.is("archived_at", null);
  const { data, error } = await query;
  if (error) throw new Error(`No se pudieron leer las cuentas: ${error.message}`);
  return data.map((a) => ({
    ...a,
    type: a.type as AccountType,
    currency: a.currency as CurrencyCode,
  }));
}

/**
 * Deuda de hoy de cada tarjeta (account_balance, 0024: en credit_card
 * positivo = lo que se debe, saldo inicial incluido). Ajustes la usa para el
 * cupo disponible. Una consulta por tarjeta: son pocas.
 */
export async function getCardDebts(accounts: AccountSummary[]): Promise<Record<string, number>> {
  const cards = accounts.filter((a) => a.type === "credit_card");
  if (cards.length === 0) return {};
  const supabase = await createClient();
  const entries = await Promise.all(
    cards.map(async (a) => {
      const { data } = await supabase.rpc("account_balance", { p_account_id: a.id });
      return [a.id, Number(data ?? 0)] as const;
    }),
  );
  return Object.fromEntries(entries);
}
