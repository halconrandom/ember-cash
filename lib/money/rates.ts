/**
 * Lectura y guardado de tasas en exchange_rates (servidor). Fase E4: cada
 * moneda guarda solo su "pata a USD" (USD/COP, EUR/USD, USD/MXN, USD/ARS);
 * ya no se guardan pares derivados (EUR/COP, etc.) porque `convert()` los
 * triangula por USD al vuelo (lib/money/convert.ts).
 *
 * - getLatestRate(base, quote): la tasa más reciente que ve el usuario para
 *   ese par (RLS permite leer a cualquier autenticado). Entre tasas de la
 *   misma fecha prefiere la fuente primaria sobre el respaldo
 *   (open.er-api.com). Por defecto USD/COP (lo que usa hoy la UI).
 * - fetchAndStoreRate: trae y guarda solo USD/COP (lo usa el botón
 *   "Reintentar" de la UI, que hoy sigue siendo binaria COP/USD).
 * - fetchAndStoreRates: trae y guarda las cuatro patas (la usa el cron).
 *   Cada una se guarda si se pudo traer, sin depender de las otras.
 */
import "server-only";

import type { CurrencyCode } from "@/lib/db/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import type { Rate } from "./convert";
import { fetchEurUsd, fetchUsdArs, fetchUsdCop, fetchUsdMxn, type FetchedRate } from "./rate-sources";

type Row = {
  base: string;
  quote: string;
  rate: number | string;
  as_of: string;
  fetched_at: string;
  source: string;
};

function toRate(row: Row): Rate {
  return {
    base: row.base as Rate["base"],
    quote: row.quote as Rate["quote"],
    rate: String(row.rate),
    asOf: row.as_of,
    fetchedAt: row.fetched_at,
    source: row.source,
  };
}

/**
 * Elige la más reciente por fecha de vigencia; a igual fecha, prefiere
 * cualquier fuente primaria sobre el respaldo (open.er-api.com).
 */
export function pickLatest(rows: Row[]): Rate | null {
  if (rows.length === 0) return null;
  const newest = rows.reduce((a, b) => (b.as_of > a.as_of ? b : a));
  const sameDay = rows.filter((r) => r.as_of === newest.as_of);
  const primary = sameDay.find((r) => r.source !== "open.er-api.com");
  return toRate(primary ?? sameDay.reduce((a, b) => (b.fetched_at > a.fetched_at ? b : a)));
}

/**
 * Todas las tasas conocidas, una por par y fecha de vigencia (si hay primaria
 * y respaldo para la misma fecha, solo la primaria). Tabla pequeña: RLS deja
 * leerla entera a cualquier autenticado. La usa <RateProvider> para poder
 * convertir en el cliente cualquier par, a la fecha de un movimiento o a la
 * más reciente, sin una consulta por fila.
 */
export async function listRates(): Promise<Rate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("exchange_rates")
    .select("base, quote, rate, as_of, fetched_at, source")
    .order("as_of", { ascending: false });
  if (error) throw new Error(`No se pudieron leer las tasas: ${error.message}`);
  const groups = new Map<string, Row[]>();
  for (const row of data) {
    const key = `${row.base}/${row.quote}/${row.as_of}`;
    const arr = groups.get(key);
    if (arr) arr.push(row);
    else groups.set(key, [row]);
  }
  return [...groups.values()]
    .map((rows) => pickLatest(rows))
    .filter((r): r is Rate => r !== null);
}

/** Tasa más reciente para un par (con el cliente del usuario). Por defecto USD/COP. */
export async function getLatestRate(
  base: CurrencyCode = "USD",
  quote: CurrencyCode = "COP",
): Promise<Rate | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("exchange_rates")
    .select("base, quote, rate, as_of, fetched_at, source")
    .eq("base", base)
    .eq("quote", quote)
    .order("as_of", { ascending: false })
    .order("fetched_at", { ascending: false })
    .limit(6);
  if (error) throw new Error(`No se pudo leer la tasa: ${error.message}`);
  return pickLatest(data);
}

/** Guarda (o actualiza) una tasa obtenida. Devuelve la fila guardada. */
export async function saveRate(fetched: FetchedRate): Promise<Rate> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("exchange_rates")
    .upsert(
      {
        base: fetched.base,
        quote: fetched.quote,
        rate: Number(fetched.rate),
        as_of: fetched.asOf,
        source: fetched.source,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "base,quote,as_of,source" },
    )
    .select("base, quote, rate, as_of, fetched_at, source")
    .single();
  if (error) throw new Error(`No se pudo guardar la tasa: ${error.message}`);
  return toRate(data);
}

export type RefreshResult = { ok: true; rate: Rate } | { ok: false; errors: string[] };

/** Trae la tasa USD/COP de las fuentes y la guarda. No escribe nada si ambas fallan. */
export async function fetchAndStoreRate(fetchImpl?: typeof fetch): Promise<RefreshResult> {
  const { rate, errors } = await fetchUsdCop(fetchImpl);
  if (!rate) return { ok: false, errors };
  return { ok: true, rate: await saveRate(rate) };
}

export type RefreshAllResult = {
  usdCop: RefreshResult;
  eurUsd: RefreshResult;
  usdMxn: RefreshResult;
  usdArs: RefreshResult;
};

/**
 * Trae y guarda las cuatro patas a USD, cada una sin depender de las otras
 * (a diferencia de la EUR/COP derivada de antes de la fase E4, ninguna
 * pata necesita que otra se haya traído bien). Cualquier cruce entre dos
 * monedas que no sea alguna de estas patas se triangula al leerlo
 * (lib/money/convert.ts), no se guarda aquí.
 */
export async function fetchAndStoreRates(fetchImpl?: typeof fetch): Promise<RefreshAllResult> {
  const [usdCopFetched, eurUsdFetched, usdMxnFetched, usdArsFetched] = await Promise.all([
    fetchUsdCop(fetchImpl),
    fetchEurUsd(fetchImpl),
    fetchUsdMxn(fetchImpl),
    fetchUsdArs(fetchImpl),
  ]);

  async function toResult(fetched: { rate: FetchedRate | null; errors: string[] }) {
    return fetched.rate
      ? ({ ok: true, rate: await saveRate(fetched.rate) } as const)
      : ({ ok: false, errors: fetched.errors } as const);
  }

  const [usdCop, eurUsd, usdMxn, usdArs] = await Promise.all([
    toResult(usdCopFetched),
    toResult(eurUsdFetched),
    toResult(usdMxnFetched),
    toResult(usdArsFetched),
  ]);

  return { usdCop, eurUsd, usdMxn, usdArs };
}
