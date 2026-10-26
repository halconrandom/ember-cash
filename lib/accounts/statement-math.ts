/**
 * Cifras del estado de una cuenta a partir de account_balance (0024).
 * Cuentas: saldo (puede ser negativo). Tarjetas: account_balance positivo es
 * lo que se debe; se muestra la deuda y el cupo disponible, nunca un saldo
 * positivo. Nada de esto entra a Deudas ni al Balance del mes.
 */
import type { AccountType, CurrencyCode } from "@/lib/db/types";
import { money, type Money } from "@/lib/money/money";
import type { TransactionRow } from "@/lib/transactions/queries";

export type AccountFigures =
  | { kind: "cash"; balance: Money }
  | { kind: "card"; debt: Money; limit: Money | null; available: Money | null };

export function accountFigures(
  type: AccountType,
  balanceMinor: number,
  currency: CurrencyCode,
  limitMinor: number | null | undefined,
): AccountFigures {
  if (type !== "credit_card") return { kind: "cash", balance: money(balanceMinor, currency) };
  const debt = Math.max(balanceMinor, 0);
  const limit = limitMinor && limitMinor > 0 ? limitMinor : null;
  return {
    kind: "card",
    debt: money(debt, currency),
    limit: limit === null ? null : money(limit, currency),
    available: limit === null ? null : money(Math.max(limit - balanceMinor, 0), currency),
  };
}

/** Los últimos `limit` movimientos de cada cuenta (salidas y entradas). */
export function recentByAccount(
  rows: readonly TransactionRow[],
  accountIds: readonly string[],
  limit: number,
): Record<string, TransactionRow[]> {
  const out: Record<string, TransactionRow[]> = Object.fromEntries(
    accountIds.map((id) => [id, [] as TransactionRow[]]),
  );
  for (const r of rows) {
    for (const id of new Set([r.account?.id, r.transferTo?.id])) {
      if (id && out[id] && out[id].length < limit) out[id].push(r);
    }
  }
  return out;
}
