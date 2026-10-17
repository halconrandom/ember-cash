/**
 * Lecturas de la pantalla Hogar (servidor). Todas pasan por RLS: solo
 * devuelven filas de un hogar del que el usuario es miembro.
 *
 * El balance es histórico (todas las transacciones compartidas y todas las
 * liquidaciones); las tarjetas de miembros y el presupuesto usan el mes
 * elegido. Las transacciones borradas (deleted_at) no cuentan.
 */
import "server-only";

import type { CategoryKey, CurrencyCode } from "@/lib/db/types";
import { money, type Money } from "@/lib/money/money";
import { createClient } from "@/lib/supabase/server";

export type HouseholdMemberInfo = {
  userId: string;
  displayName: string | null;
  role: "owner" | "member";
  joinedAt: string;
};

export type SharedTransaction = {
  id: string;
  kind: "expense" | "income";
  categoryKey: CategoryKey;
  description: string;
  amount: Money;
  occurredOn: string;
  paidBy: string;
  splits: { userId: string; share: Money }[];
};

export type Settlement = {
  id: string;
  fromUser: string;
  toUser: string;
  amount: Money;
  settledOn: string;
  createdBy: string;
};

export type Budget = {
  id: string;
  categoryKey: CategoryKey;
  limit: Money;
  month: string;
};

export type SharedGoal = {
  id: string;
  name: string;
  target: Money;
  saved: Money;
  targetDate: string | null;
  /** Aportes por miembro, en la moneda de la meta. */
  byMember: Record<string, Money>;
};

/** Miembros con su fecha de ingreso, en orden de ingreso (A, B). */
export async function getHouseholdMembers(householdId: string): Promise<HouseholdMemberInfo[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_household_members", { hid: householdId });
  if (error) throw new Error(`No se pudieron leer los miembros: ${error.message}`);
  return data
    .map((m) => ({
      userId: m.user_id,
      displayName: m.display_name,
      role: m.role as HouseholdMemberInfo["role"],
      joinedAt: m.joined_at,
    }))
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
}

type TxRow = {
  id: string;
  kind: string;
  category_key: string;
  description: string;
  amount_minor: number;
  currency: string;
  occurred_on: string;
  paid_by: string | null;
  owner_id: string;
  transaction_splits: { user_id: string; share_minor: number }[];
};

/** Gastos e ingresos compartidos del hogar (sin transferencias), recientes primero. */
export async function listSharedTransactions(householdId: string): Promise<SharedTransaction[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transactions")
    .select(
      "id, kind, category_key, description, amount_minor, currency, occurred_on, paid_by, owner_id, transaction_splits(user_id, share_minor)",
    )
    .eq("household_id", householdId)
    .is("deleted_at", null)
    .in("kind", ["expense", "income"])
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(`No se pudieron leer los gastos compartidos: ${error.message}`);
  return (data as unknown as TxRow[]).map((r) => {
    const currency = r.currency as CurrencyCode;
    return {
      id: r.id,
      kind: r.kind as SharedTransaction["kind"],
      categoryKey: r.category_key as CategoryKey,
      description: r.description,
      amount: money(r.amount_minor, currency),
      occurredOn: r.occurred_on,
      // Si quien pagó borró su cuenta (paid_by nulo), cuenta como del dueño.
      paidBy: r.paid_by ?? r.owner_id,
      splits: r.transaction_splits.map((s) => ({
        userId: s.user_id,
        share: money(s.share_minor, currency),
      })),
    };
  });
}

/** Liquidaciones del hogar, recientes primero. */
export async function listSettlements(householdId: string): Promise<Settlement[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("settlements")
    .select("id, from_user, to_user, amount_minor, currency, settled_on, created_by")
    .eq("household_id", householdId)
    .order("settled_on", { ascending: false })
    .order("id");
  if (error) throw new Error(`No se pudieron leer las liquidaciones: ${error.message}`);
  return data.map((s) => ({
    id: s.id,
    fromUser: s.from_user,
    toUser: s.to_user,
    amount: money(s.amount_minor, s.currency as CurrencyCode),
    settledOn: s.settled_on,
    createdBy: s.created_by,
  }));
}

/** Presupuestos compartidos de un mes (AAAA-MM). */
export async function listBudgets(householdId: string, month: string): Promise<Budget[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("budgets")
    .select("id, category_key, limit_minor, currency, month")
    .eq("household_id", householdId)
    .eq("month", `${month}-01`)
    .order("category_key");
  if (error) throw new Error(`No se pudieron leer los presupuestos: ${error.message}`);
  return data.map((b) => ({
    id: b.id,
    categoryKey: b.category_key as CategoryKey,
    limit: money(b.limit_minor, b.currency as CurrencyCode),
    month: b.month,
  }));
}

/** Mes más reciente anterior a `month` que tiene presupuestos (para copiarlos). */
export async function previousBudgetMonth(
  householdId: string,
  month: string,
): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("budgets")
    .select("month")
    .eq("household_id", householdId)
    .lt("month", `${month}-01`)
    .order("month", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? data.month.slice(0, 7) : null;
}

type GoalRow = {
  id: string;
  name: string;
  target_minor: number;
  currency: string;
  target_date: string | null;
  goal_contributions: { user_id: string; amount_minor: number; currency: string }[];
};

/** Primera meta compartida activa (la más antigua), con aportes por miembro. */
export async function getSharedGoal(householdId: string): Promise<SharedGoal | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("goals")
    .select(
      "id, name, target_minor, currency, target_date, goal_contributions(user_id, amount_minor, currency)",
    )
    .eq("household_id", householdId)
    .is("archived_at", null)
    .order("started_on")
    .order("name")
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const r = data as unknown as GoalRow;
  const currency = r.currency as CurrencyCode;
  const byMember: Record<string, bigint> = {};
  let saved = 0n;
  // Igual que en Ahorros: un aporte en otra moneda no se suma.
  for (const c of r.goal_contributions) {
    if (c.currency !== currency) continue;
    byMember[c.user_id] = (byMember[c.user_id] ?? 0n) + BigInt(c.amount_minor);
    saved += BigInt(c.amount_minor);
  }
  return {
    id: r.id,
    name: r.name,
    target: money(r.target_minor, currency),
    saved: money(saved, currency),
    targetDate: r.target_date,
    byMember: Object.fromEntries(Object.entries(byMember).map(([u, v]) => [u, money(v, currency)])),
  };
}
