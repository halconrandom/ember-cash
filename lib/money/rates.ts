/**
 * Lectura y guardado de tasas en exchange_rates (servidor). Fase E1: tres
 * pares (USD/COP, EUR/USD, EUR/COP); `convert()` usa cada uno en el sentido
 * que haga falta.
 *
 * - getLatestRate(base, quote): la tasa más reciente que ve el usuario para
 *   ese par (RLS permite leer a cualquier autenticado). Entre tasas de la
 *   misma fecha prefiere la fuente primaria sobre el respaldo
 *   (open.er-api.com). Por defecto USD/COP (lo que usa hoy la UI).
 * - fetchAndStoreRate: trae y guarda solo USD/COP (lo usa el botón
 *   "Reintentar" de la UI, que hoy sigue siendo binaria COP/USD).
 * - fetchAndStoreRates: trae y guarda los tres pares (la usa el cron). Si
 *   USD/COP o EUR/USD fallan, EUR/COP tampoco se deriva: nunca se inventa
 *   una tasa con el último valor conocido del otro par.
 */
import "server-only";

import type { CurrencyCode } from "@/lib/db/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import type { Rate } from "./convert";
import { deriveEurCop, fetchEurUsd, fetchUsdCop, type FetchedRate } from "./rate-sources";

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
  eurCop: RefreshResult;
};

/**
 * Trae y guarda los tres pares. EUR/COP se deriva de EUR/USD × USD/COP: si
 * alguno de los dos no se pudo traer (ni de su fuente ni de su respaldo),
 * EUR/COP tampoco se guarda esta vez (queda la última tasa conocida).
 */
export async function fetchAndStoreRates(fetchImpl?: typeof fetch): Promise<RefreshAllResult> {
  const [usdCopFetched, eurUsdFetched] = await Promise.all([
    fetchUsdCop(fetchImpl),
    fetchEurUsd(fetchImpl),
  ]);

  const usdCop: RefreshResult = usdCopFetched.rate
    ? { ok: true, rate: await saveRate(usdCopFetched.rate) }
    : { ok: false, errors: usdCopFetched.errors };
  const eurUsd: RefreshResult = eurUsdFetched.rate
    ? { ok: true, rate: await saveRate(eurUsdFetched.rate) }
    : { ok: false, errors: eurUsdFetched.errors };

  const eurCop: RefreshResult =
    usdCopFetched.rate && eurUsdFetched.rate
      ? { ok: true, rate: await saveRate(deriveEurCop(eurUsdFetched.rate, usdCopFetched.rate)) }
      : {
          ok: false,
          errors: ["No se pudo derivar EUR/COP: falta USD/COP, EUR/USD, o las dos."],
        };

  return { usdCop, eurUsd, eurCop };
}
