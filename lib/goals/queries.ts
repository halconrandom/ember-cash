/**
 * Consultas de metas (servidor). Respetan el scope y excluyen las archivadas.
 * Lo ahorrado es la suma de los aportes en la moneda de la meta.
 */
import "server-only";

import type { CurrencyCode } from "@/lib/db/types";
import { add, money, type Money } from "@/lib/money/money";
import type { Scope } from "@/lib/scope/constants";
import { createClient } from "@/lib/supabase/server";

import type { GoalIcon } from "./schema";

export type GoalSummary = {
  id: string;
  name: string;
  iconKey: GoalIcon;
  target: Money;
  saved: Money;
  monthly: Money | null;
  startedOn: string;
  targetDate: string | null;
};

type Row = {
  id: string;
  name: string;
  icon_key: string | null;
  target_minor: number;
  currency: string;
  target_date: string | null;
  monthly_contribution_minor: number | null;
  started_on: string;
  goal_contributions: { amount_minor: number; currency: string }[];
};

function toSummary(r: Row): GoalSummary {
  const currency = r.currency as CurrencyCode;
  // Los aportes se registran en la moneda de la meta; uno en otra moneda no se suma.
  const saved = r.goal_contributions
    .filter((c) => c.currency === currency)
    .reduce((acc, c) => add(acc, money(c.amount_minor, currency)), money(0n, currency));
  return {
    id: r.id,
    name: r.name,
    iconKey: (r.icon_key ?? "piggy-bank") as GoalIcon,
    target: money(r.target_minor, currency),
    saved,
    monthly:
      r.monthly_contribution_minor === null ? null : money(r.monthly_contribution_minor, currency),
    startedOn: r.started_on,
    targetDate: r.target_date,
  };
}

const COLUMNS =
  "id, name, icon_key, target_minor, currency, target_date, monthly_contribution_minor, started_on, goal_contributions(amount_minor, currency)";

export async function listGoals(scope: Scope): Promise<GoalSummary[]> {
  const supabase = await createClient();
  let query = supabase
    .from("goals")
    .select(COLUMNS)
    .is("archived_at", null)
    .order("started_on")
    .order("name");
  query =
    scope.kind === "personal"
      ? query.is("household_id", null)
      : query.eq("household_id", scope.householdId);
  const { data, error } = await query;
  if (error) throw new Error(`No se pudieron leer las metas: ${error.message}`);
  return (data as unknown as Row[]).map(toSummary);
}

export async function getGoal(id: string): Promise<GoalSummary | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("goals")
    .select(COLUMNS)
    .eq("id", id)
    .is("archived_at", null)
    .maybeSingle();
  if (error || !data) return null;
  return toSummary(data as unknown as Row);
}

export type LinkableTransaction = {
  id: string;
  description: string;
  amount: Money;
  occurredOn: string;
};

/** Transacciones recientes del scope en una moneda, para vincular un aporte. */
export async function listLinkableTransactions(
  scope: Scope,
  currency: CurrencyCode,
): Promise<LinkableTransaction[]> {
  const supabase = await createClient();
  let query = supabase
    .from("transactions")
    .select("id, description, amount_minor, currency, occurred_on")
    .is("deleted_at", null)
    .eq("currency", currency)
    .order("occurred_on", { ascending: false })
    .limit(30);
  query =
    scope.kind === "personal"
      ? query.is("household_id", null)
      : query.eq("household_id", scope.householdId);
  const { data, error } = await query;
  if (error) return [];
  return data.map((t) => ({
    id: t.id,
    description: t.description,
    amount: money(t.amount_minor, currency),
    occurredOn: t.occurred_on,
  }));
}
