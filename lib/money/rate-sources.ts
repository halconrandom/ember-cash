/**
 * Fuentes de la tasa USD→COP.
 * 1. TRM oficial (Superintendencia Financiera) en datos.gov.co, conjunto
 *    32sa-8pi3: el registro con la vigencia más reciente.
 * 2. Respaldo: open.er-api.com (ExchangeRate-API), si la TRM falla.
 * Cada respuesta se valida (forma y rango razonable). Si una fuente devuelve
 * algo raro se descarta: nunca se inventa una tasa.
 */
import { z } from "zod";

export type RateSource = "datos.gov.co" | "open.er-api.com";

export type FetchedRate = {
  base: "USD";
  quote: "COP";
  /** Decimal en texto ("3174.67"). */
  rate: string;
  /** Fecha de vigencia (AAAA-MM-DD). */
  asOf: string;
  source: RateSource;
};

export const TRM_URL =
  "https://www.datos.gov.co/resource/32sa-8pi3.json?$order=vigenciadesde%20DESC&$limit=1";
export const OPEN_ER_URL = "https://open.er-api.com/v6/latest/USD";

/** Rango razonable de COP por USD; fuera de esto la respuesta se descarta. */
const MIN_RATE = 1000;
const MAX_RATE = 20000;
const TIMEOUT_MS = 8000;

type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const trmSchema = z
  .array(
    z.object({
      valor: z.string().regex(/^\d+(\.\d+)?$/),
      unidad: z.literal("COP"),
      vigenciadesde: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
    }),
  )
  .min(1);

const openErSchema = z.object({
  result: z.literal("success"),
  time_last_update_unix: z.number().int().positive(),
  rates: z.object({ COP: z.number().positive() }),
});

function inRange(rate: string): string {
  const n = Number(rate);
  if (!(n >= MIN_RATE && n <= MAX_RATE)) throw new Error(`Tasa fuera de rango: ${rate}`);
  return rate;
}

async function getJson(fetchImpl: FetchLike, url: string): Promise<unknown> {
  const res = await fetchImpl(url, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${new URL(url).host}`);
  return res.json();
}

/** TRM oficial vigente. */
export async function fetchTrm(fetchImpl: FetchLike = fetch): Promise<FetchedRate> {
  const [row] = trmSchema.parse(await getJson(fetchImpl, TRM_URL));
  return {
    base: "USD",
    quote: "COP",
    rate: inRange(row.valor),
    asOf: row.vigenciadesde.slice(0, 10),
    source: "datos.gov.co",
  };
}

/** Tasa de mercado de open.er-api (respaldo). */
export async function fetchOpenEr(fetchImpl: FetchLike = fetch): Promise<FetchedRate> {
  const data = openErSchema.parse(await getJson(fetchImpl, OPEN_ER_URL));
  return {
    base: "USD",
    quote: "COP",
    // Máximo 6 decimales, sin ceros sobrantes.
    rate: inRange(String(Number(data.rates.COP.toFixed(6)))),
    asOf: new Date(data.time_last_update_unix * 1000).toISOString().slice(0, 10),
    source: "open.er-api.com",
  };
}

/** Prueba la TRM y, si falla, el respaldo. Devuelve null si fallan las dos. */
export async function fetchUsdCop(
  fetchImpl: FetchLike = fetch,
): Promise<{ rate: FetchedRate | null; errors: string[] }> {
  const errors: string[] = [];
  for (const source of [fetchTrm, fetchOpenEr]) {
    try {
      return { rate: await source(fetchImpl), errors };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  return { rate: null, errors };
}
