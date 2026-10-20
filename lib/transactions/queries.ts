/**
 * Consultas de transacciones (servidor). Siempre respetan el scope y nunca
 * incluyen las borradas (deleted_at) ni el saldo inicial (kind opening):
 * ese movimiento no se edita como un ingreso. La paginación es del servidor.
 */
import "server-only";

import type { AccountType, CategoryKey, CurrencyCode } from "@/lib/db/types";
import { money, type Money } from "@/lib/money/money";
import type { Scope } from "@/lib/scope/constants";
import { createClient } from "@/lib/supabase/server";

import { dateRange, PAGE_SIZE, type TransactionFilters } from "./filters";
import type { TransactionKind } from "./schema";

export type AccountRef = { id: string; name: string; type: AccountType };

export type TransactionRow = {
  id: string;
  kind: TransactionKind;
  categoryKey: CategoryKey | null;
  description: string;
  note: string | null;
  amount: Money;
  occurredOn: string;
  paidBy: string | null;
  account: AccountRef | null;
  transferTo: AccountRef | null;
  /**
   * Compartida con un reparto o pagador que ya salió del hogar: solo se
   * editan categoría y nota (0010). Solo lo llena getTransaction.
   */
  locked?: boolean;
};

export type TransactionPage = {
  rows: TransactionRow[];
  total: number;
  page: number;
  pageCount: number;
};

const COLUMNS =
  "id, kind, category_key, description, note, amount_minor, currency, occurred_on, paid_by, household_id, " +
  "account:accounts!transactions_account_id_fkey(id, name, type), " +
  "transfer_to:accounts!transactions_transfer_to_account_id_fkey(id, name, type)";

type DbRow = {
  id: string;
  kind: string;
  category_key: string | null;
  description: string;
  note: string | null;
  amount_minor: number;
  currency: string;
  occurred_on: string;
  paid_by: string | null;
  account: { id: string; name: string; type: string } | null;
  transfer_to: { id: string; name: string; type: string } | null;
};

function toRow(r: DbRow): TransactionRow {
  return {
    id: r.id,
    kind: r.kind as TransactionKind,
    categoryKey: r.category_key as CategoryKey | null,
    description: r.description,
    note: r.note,
    amount: money(r.amount_minor, r.currency as CurrencyCode),
    occurredOn: r.occurred_on,
    paidBy: r.paid_by,
    account: r.account ? { ...r.account, type: r.account.type as AccountType } : null,
    transferTo: r.transfer_to
      ? { ...r.transfer_to, type: r.transfer_to.type as AccountType }
      : null,
  };
}

/** Quita caracteres con significado en los filtros de PostgREST. */
function sanitizeSearch(q: string): string {
  return q
    .replace(/[%_\\,()"'*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function listTransactions(
  filters: TransactionFilters,
  scope: Scope,
  today: string,
): Promise<TransactionPage> {
  const supabase = await createClient();
  let query = supabase
    .from("transactions")
    .select(COLUMNS, { count: "exact" })
    .is("deleted_at", null)
    .neq("kind", "opening");

  query =
    scope.kind === "personal"
      ? query.is("household_id", null)
      : query.eq("household_id", scope.householdId);

  const { from, to } = dateRange(filters, today);
  if (from) query = query.gte("occurred_on", from);
  if (to) query = query.lte("occurred_on", to);

  if (filters.type !== "all") query = query.eq("kind", filters.type);
  if (filters.category === "transfer") query = query.eq("kind", "transfer");
  else if (filters.category !== "all") query = query.eq("category_key", filters.category);
  if (filters.currency !== "all") query = query.eq("currency", filters.currency);
  if (filters.account !== "all") {
    query = query.or(
      `account_id.eq.${filters.account},transfer_to_account_id.eq.${filters.account}`,
    );
  }
  const q = sanitizeSearch(filters.q);
  if (q) query = query.or(`description.ilike.%${q}%,note.ilike.%${q}%`);

  const offset = (filters.page - 1) * PAGE_SIZE;
  const { data, error, count } = await query
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);
  if (error) throw new Error(`No se pudieron leer las transacciones: ${error.message}`);

  const total = count ?? 0;
  return {
    rows: (data as unknown as DbRow[]).map(toRow),
    total,
    page: filters.page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

/** Una transacción para editar. Null si no existe, es ajena, está borrada o es un saldo inicial. */
export async function getTransaction(id: string): Promise<TransactionRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("transactions")
    .select(COLUMNS)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return null;
  const raw = data as unknown as DbRow;
  // El formulario solo conoce gasto, ingreso y transferencia.
  if (raw.kind === "opening") return null;
  const row = toRow(raw);
  if (!(data as unknown as { household_id: string | null }).household_id) return row;
  const { data: locked } = await supabase.rpc("transaction_has_former_member", { tid: id });
  return { ...row, locked: Boolean(locked) };
}
