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
>;

export async function getAccounts(
  scope: Scope,
  { includeArchived = false } = {},
): Promise<AccountSummary[]> {
  const supabase = await createClient();
  let query = supabase
    .from("accounts")
    .select("id, name, type, currency, archived_at, household_id")
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
