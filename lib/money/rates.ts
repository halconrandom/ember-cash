/**
 * Lectura y guardado de tasas en exchange_rates (servidor).
 * - getLatestRate: la tasa USD/COP más reciente que ve el usuario (RLS permite
 *   leer a cualquier autenticado). Entre tasas de la misma fecha prefiere la
 *   TRM oficial.
 * - fetchAndStoreRate: trae la tasa de las fuentes y la guarda con la service
 *   role. Si las dos fuentes fallan no escribe nada: queda la última.
 */
import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import type { Rate } from "./convert";
import { fetchUsdCop, type FetchedRate } from "./rate-sources";

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

/** Elige la más reciente por fecha de vigencia; a igual fecha, la TRM. */
export function pickLatest(rows: Row[]): Rate | null {
  if (rows.length === 0) return null;
  const newest = rows.reduce((a, b) => (b.as_of > a.as_of ? b : a));
  const sameDay = rows.filter((r) => r.as_of === newest.as_of);
  const official = sameDay.find((r) => r.source === "datos.gov.co");
  return toRate(official ?? sameDay.reduce((a, b) => (b.fetched_at > a.fetched_at ? b : a)));
}

/** Tasa USD/COP más reciente (con el cliente del usuario). */
export async function getLatestRate(): Promise<Rate | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("exchange_rates")
    .select("base, quote, rate, as_of, fetched_at, source")
    .eq("base", "USD")
    .eq("quote", "COP")
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

/** Trae la tasa de las fuentes y la guarda. No escribe nada si ambas fallan. */
export async function fetchAndStoreRate(fetchImpl?: typeof fetch): Promise<RefreshResult> {
  const { rate, errors } = await fetchUsdCop(fetchImpl);
  if (!rate) return { ok: false, errors };
  return { ok: true, rate: await saveRate(rate) };
}
