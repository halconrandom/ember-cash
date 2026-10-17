/**
 * Consultas de deudas (servidor). Las deudas son siempre personales (la tabla
 * no tiene household_id), así que no dependen del scope. Excluye las
 * cerradas y las borradas. El saldo es el principal original menos el
 * capital pagado.
 */
import "server-only";

import type { CurrencyCode } from "@/lib/db/types";
import { money, type Money } from "@/lib/money/money";
import { createClient } from "@/lib/supabase/server";

import type { AprKind } from "./payoff";
import type { DebtIcon } from "./schema";

export type DebtSummary = {
  id: string;
  name: string;
  subtitle: string | null;
  iconKey: DebtIcon;
  original: Money;
  /** Capital pagado (suma de principal_minor de los pagos). */
  paid: Money;
  /** Saldo = original − pagado (nunca negativo). */
  balance: Money;
  aprBps: number;
  aprKind: AprKind;
  minPayment: Money;
  dueDay: number | null;
};

type Row = {
  id: string;
  name: string;
  subtitle: string | null;
  icon_key: string | null;
  currency: string;
  original_principal_minor: number;
  apr_bps: number;
  apr_kind: string;
  min_payment_minor: number;
  due_day: number | null;
  debt_payments: { principal_minor: number }[];
};

function toSummary(r: Row): DebtSummary {
  const currency = r.currency as CurrencyCode;
  const paidMinor = r.debt_payments.reduce((s, p) => s + BigInt(p.principal_minor), 0n);
  const originalMinor = BigInt(r.original_principal_minor);
  const balanceMinor = originalMinor - paidMinor;
  return {
    id: r.id,
    name: r.name,
    subtitle: r.subtitle,
    iconKey: (r.icon_key ?? "credit-card") as DebtIcon,
    original: money(originalMinor, currency),
    paid: money(paidMinor, currency),
    balance: money(balanceMinor > 0n ? balanceMinor : 0n, currency),
    aprBps: r.apr_bps,
    aprKind: r.apr_kind as AprKind,
    minPayment: money(r.min_payment_minor, currency),
    dueDay: r.due_day,
  };
}

const COLUMNS =
  "id, name, subtitle, icon_key, currency, original_principal_minor, apr_bps, apr_kind, min_payment_minor, due_day, debt_payments(principal_minor)";

export async function listDebts(): Promise<DebtSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("debts")
    .select(COLUMNS)
    .is("deleted_at", null)
    .is("closed_at", null)
    .order("name");
  if (error) throw new Error(`No se pudieron leer las deudas: ${error.message}`);
  return (data as unknown as Row[]).map(toSummary);
}
