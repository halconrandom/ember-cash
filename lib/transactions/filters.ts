/**
 * Filtros de la pantalla de transacciones, guardados en la URL:
 *   ?q=&category=&account=&currency=&type=&range=&from=&to=&month=&page=
 * parseFilters los lee con valores por defecto seguros (cualquier valor raro
 * vuelve al defecto) y dateRange calcula el rango de fechas a consultar.
 */
import { z } from "zod";

import { CURRENCY_CODES, EXPENSE_CATEGORY_KEYS, INCOME_CATEGORY_KEYS } from "@/lib/db/types";

import { addDays, DATE_PATTERN, monthBounds, MONTH_PATTERN } from "./dates";

/** Filas por página (como 02-transactions.png: "Showing 9 of 42"). */
export const PAGE_SIZE = 9;

export const TYPE_TABS = ["all", "income", "expense"] as const;
export const RANGES = ["month", "last30", "last90", "year", "all", "custom"] as const;
const CATEGORY_FILTERS = [
  "all",
  ...EXPENSE_CATEGORY_KEYS,
  ...INCOME_CATEGORY_KEYS,
  "transfer",
] as const;

export type TransactionFilters = {
  q: string;
  category: (typeof CATEGORY_FILTERS)[number];
  account: string; // "all" o uuid
  currency: "all" | (typeof CURRENCY_CODES)[number];
  type: (typeof TYPE_TABS)[number];
  range: (typeof RANGES)[number];
  from: string | null;
  to: string | null;
  month: string; // AAAA-MM
  page: number;
};

type RawParams = Record<string, string | string[] | undefined>;

/** Toma el primer valor de un parámetro y lo valida; si no sirve, `fallback`. */
function pick<T>(schema: z.ZodType<T>, value: string | string[] | undefined, fallback: T): T {
  const result = schema.safeParse(Array.isArray(value) ? value[0] : value);
  return result.success ? result.data : fallback;
}

export function parseFilters(params: RawParams, today: string): TransactionFilters {
  const currentMonth = today.slice(0, 7);
  const range = pick(z.enum(RANGES), params.range, "month");
  const from = pick(z.string().regex(DATE_PATTERN), params.from, null as string | null);
  const to = pick(z.string().regex(DATE_PATTERN), params.to, null as string | null);
  return {
    q: pick(z.string().max(100), params.q, "").trim(),
    category: pick(z.enum(CATEGORY_FILTERS), params.category, "all"),
    account: pick(z.union([z.literal("all"), z.uuid()]), params.account, "all"),
    currency: pick(z.enum(["all", ...CURRENCY_CODES]), params.currency, "all"),
    type: pick(z.enum(TYPE_TABS), params.type, "all"),
    // Un rango personalizado sin las dos fechas vuelve a "este mes".
    range: range === "custom" && !(from && to) ? "month" : range,
    from,
    to,
    month: pick(z.string().regex(MONTH_PATTERN), params.month, currentMonth),
    page: pick(z.coerce.number().int().min(1).max(10_000), params.page, 1),
  };
}

/** Rango de fechas (inclusive) a consultar; null en un extremo = sin límite. */
export function dateRange(
  f: TransactionFilters,
  today: string,
): { from: string | null; to: string | null } {
  switch (f.range) {
    case "month":
      return monthBounds(f.month);
    case "last30":
      return { from: addDays(today, -29), to: today };
    case "last90":
      return { from: addDays(today, -89), to: today };
    case "year":
      return { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` };
    case "custom": {
      // Si vienen al revés, se ordenan.
      const [a, b] = [f.from!, f.to!].sort();
      return { from: a, to: b };
    }
    default:
      return { from: null, to: null };
  }
}

/** Valores por defecto (no se escriben en la URL). */
const DEFAULTS: Partial<Record<keyof TransactionFilters, string>> = {
  q: "",
  category: "all",
  account: "all",
  currency: "all",
  type: "all",
  range: "month",
  page: "1",
};

/**
 * Nueva query string con los cambios aplicados. Quita los valores por
 * defecto y vuelve a la página 1 si cambia cualquier filtro.
 */
export function withFilters(
  current: URLSearchParams,
  changes: Partial<
    Record<
      | keyof TransactionFilters
      | "tx"
      | "goal"
      | "contribute"
      | "debt"
      | "pay"
      | "sub"
      | "event"
      | "day",
      string | null
    >
  >,
): string {
  const next = new URLSearchParams(current);
  for (const [key, value] of Object.entries(changes)) {
    if (
      value === null ||
      value === undefined ||
      DEFAULTS[key as keyof TransactionFilters] === value
    )
      next.delete(key);
    else next.set(key, value);
  }
  // Abrir o cerrar un modal (tx, goal, contribute) no cambia de página.
  const MODAL_KEYS = ["tx", "goal", "contribute", "debt", "pay", "sub", "event"];
  if (!("page" in changes) && Object.keys(changes).some((k) => !MODAL_KEYS.includes(k)))
    next.delete("page");
  if (next.get("range") !== "custom") {
    next.delete("from");
    next.delete("to");
  }
  const qs = next.toString();
  return qs ? `?${qs}` : "";
}
