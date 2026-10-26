/**
 * Estado de cuentas (/accounts y la tarjeta Cuentas del dashboard): cuentas
 * personales con su saldo (account_balance), condiciones de la tarjeta y
 * sus movimientos recientes. Solo lectura; RLS limita a lo del usuario.
 */
import "server-only";

import type { AccountType, CurrencyCode } from "@/lib/db/types";
import { PERSONAL_SCOPE } from "@/lib/scope/constants";
import { createClient } from "@/lib/supabase/server";
import { COLUMNS, toRow, type DbRow, type TransactionRow } from "@/lib/transactions/queries";

import { getAccounts } from "./queries";
import { accountFigures, recentByAccount, type AccountFigures } from "./statement-math";

export type AccountStatement = {
  id: string;
  name: string;
  type: AccountType;
  currency: CurrencyCode;
  archived: boolean;
  figures: AccountFigures;
  paymentDay: number | null;
  aprBps: number | null;
  /** Deuda enlazada en /debts (0031). */
  debtId: string | null;
  recent: TransactionRow[];
};

export const RECENT_PER_ACCOUNT = 8;

export async function getAccountStatements({
  includeArchived = true,
  recent = RECENT_PER_ACCOUNT,
} = {}): Promise<AccountStatement[]> {
  const accounts = await getAccounts(PERSONAL_SCOPE, { includeArchived });
  if (accounts.length === 0) return [];
  const supabase = await createClient();
  const ids = accounts.map((a) => a.id);
  const list = ids.join(",");
  const [balances, debts, tx] = await Promise.all([
    Promise.all(
      ids.map(async (id) => {
        const { data, error } = await supabase.rpc("account_balance", { p_account_id: id });
        if (error) throw new Error(`No se pudo leer el saldo: ${error.message}`);
        return [id, Number(data ?? 0)] as const;
      }),
    ),
    supabase
      .from("debts")
      .select("id, account_id, apr_bps")
      .in("account_id", ids)
      .is("deleted_at", null),
    recent > 0
      ? supabase
          .from("transactions")
          .select(COLUMNS)
          .is("deleted_at", null)
          .is("household_id", null)
          .neq("kind", "opening")
          .or(`account_id.in.(${list}),transfer_to_account_id.in.(${list})`)
          .order("occurred_on", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(Math.min(ids.length * recent, 300))
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (tx.error) throw new Error(`No se pudieron leer los movimientos: ${tx.error.message}`);
  const balanceOf = Object.fromEntries(balances);
  const debtOf = new Map((debts.data ?? []).map((d) => [d.account_id, d]));
  const rows = ((tx.data ?? []) as unknown as DbRow[]).map(toRow);
  const byAccount = recentByAccount(rows, ids, recent);
  return accounts.map((a) => {
    const debt = debtOf.get(a.id);
    return {
      id: a.id,
      name: a.name,
      type: a.type,
      currency: a.currency,
      archived: a.archived_at !== null,
      figures: accountFigures(a.type, balanceOf[a.id] ?? 0, a.currency, a.credit_limit_minor),
      paymentDay: a.payment_day ?? null,
      aprBps: debt?.apr_bps ?? null,
      debtId: debt?.id ?? null,
      recent: byAccount[a.id] ?? [],
    };
  });
}
