/**
 * Fuentes de las tasas de cambio (fase E1: USD, COP, EUR).
 *
 * Pares que se guardan (alcanza con un sentido por par; `convert()` usa la
 * tasa en el sentido que haga falta):
 * - USD/COP: TRM oficial (Superintendencia Financiera) en datos.gov.co,
 *   conjunto 32sa-8pi3: el registro con la vigencia más reciente. Respaldo:
 *   open.er-api.com (base USD).
 * - EUR/USD: Frankfurter (api.frankfurter.app, tasas del Banco Central
 *   Europeo). Respaldo: open.er-api.com (reciprocal de su tasa USD→EUR).
 * - EUR/COP: no se consulta directo; se deriva multiplicando EUR/USD por
 *   USD/COP (1 EUR = (EUR/USD) USD = (EUR/USD × USD/COP) COP). Si falta
 *   cualquiera de los dos, no se deriva nada.
 *
 * Cada respuesta se valida (forma y rango razonable para ese par). Si una
 * fuente devuelve algo raro se descarta: nunca se inventa una tasa.
 */
import { z } from "zod";

export type RateSource =
  | "datos.gov.co"
  | "frankfurter.app"
  | "open.er-api.com"
  | `derived:${string}`;

export type RatePair = { base: "USD" | "EUR"; quote: "COP" | "USD" };

export type FetchedRate = {
  base: "USD" | "EUR";
  quote: "COP" | "USD";
  /** Decimal en texto ("3174.67"). */
  rate: string;
  /** Fecha de vigencia (AAAA-MM-DD). */
  asOf: string;
  source: RateSource;
};

export const TRM_URL =
  "https://www.datos.gov.co/resource/32sa-8pi3.json?$order=vigenciadesde%20DESC&$limit=1";
export const OPEN_ER_URL = "https://open.er-api.com/v6/latest/USD";
export const FRANKFURTER_URL = "https://api.frankfurter.app/latest?from=EUR&to=USD";

/** Rango razonable por par; fuera de esto la respuesta se descarta. */
const RATE_RANGE: Record<"USD/COP" | "EUR/USD", { min: number; max: number }> = {
  "USD/COP": { min: 1000, max: 20000 },
  "EUR/USD": { min: 0.5, max: 2.5 },
};
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
  rates: z.object({ COP: z.number().positive(), EUR: z.number().positive() }),
});

const frankfurterSchema = z.object({
  base: z.literal("EUR"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rates: z.object({ USD: z.number().positive() }),
});

function inRange(pair: keyof typeof RATE_RANGE, rate: string): string {
  const { min, max } = RATE_RANGE[pair];
  const n = Number(rate);
  if (!(n >= min && n <= max)) throw new Error(`Tasa ${pair} fuera de rango: ${rate}`);
  return rate;
}

/** Máximo 6 decimales, sin ceros sobrantes (igual que el valor que llega de las APIs). */
function trimRate(n: number): string {
  return String(Number(n.toFixed(6)));
}

async function getJson(fetchImpl: FetchLike, url: string): Promise<unknown> {
  const res = await fetchImpl(url, { cache: "no-store", signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${new URL(url).host}`);
  return res.json();
}

/** TRM oficial vigente (USD/COP). */
export async function fetchTrm(fetchImpl: FetchLike = fetch): Promise<FetchedRate> {
  const [row] = trmSchema.parse(await getJson(fetchImpl, TRM_URL));
  return {
    base: "USD",
    quote: "COP",
    rate: inRange("USD/COP", row.valor),
    asOf: row.vigenciadesde.slice(0, 10),
    source: "datos.gov.co",
  };
}

/** Tasa EUR/USD del Banco Central Europeo (Frankfurter). */
export async function fetchFrankfurter(fetchImpl: FetchLike = fetch): Promise<FetchedRate> {
  const data = frankfurterSchema.parse(await getJson(fetchImpl, FRANKFURTER_URL));
  return {
    base: "EUR",
    quote: "USD",
    rate: inRange("EUR/USD", trimRate(data.rates.USD)),
    asOf: data.date,
    source: "frankfurter.app",
  };
}

/** USD/COP de open.er-api (respaldo de la TRM). */
export async function fetchOpenEr(fetchImpl: FetchLike = fetch): Promise<FetchedRate> {
  const data = openErSchema.parse(await getJson(fetchImpl, OPEN_ER_URL));
  return {
    base: "USD",
    quote: "COP",
    rate: inRange("USD/COP", trimRate(data.rates.COP)),
    asOf: new Date(data.time_last_update_unix * 1000).toISOString().slice(0, 10),
    source: "open.er-api.com",
  };
}

/**
 * EUR/USD de open.er-api (respaldo de Frankfurter): open-er da USD→EUR
 * (1 USD = rates.EUR EUR), así que EUR/USD es la reciprocal.
 */
export async function fetchOpenErEurUsd(fetchImpl: FetchLike = fetch): Promise<FetchedRate> {
  const data = openErSchema.parse(await getJson(fetchImpl, OPEN_ER_URL));
  return {
    base: "EUR",
    quote: "USD",
    rate: inRange("EUR/USD", trimRate(1 / data.rates.EUR)),
    asOf: new Date(data.time_last_update_unix * 1000).toISOString().slice(0, 10),
    source: "open.er-api.com",
  };
}

export type SourceResult = { rate: FetchedRate | null; errors: string[] };

/** Prueba las fuentes en orden y devuelve la primera que responda. */
async function tryInOrder(
  sources: ((fetchImpl: FetchLike) => Promise<FetchedRate>)[],
  fetchImpl: FetchLike,
): Promise<SourceResult> {
  const errors: string[] = [];
  for (const source of sources) {
    try {
      return { rate: await source(fetchImpl), errors };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  return { rate: null, errors };
}

/** Tasa USD/COP: TRM y, si falla, open.er-api. */
export async function fetchUsdCop(fetchImpl: FetchLike = fetch): Promise<SourceResult> {
  return tryInOrder([fetchTrm, fetchOpenEr], fetchImpl);
}

/** Tasa EUR/USD: Frankfurter y, si falla, open.er-api. */
export async function fetchEurUsd(fetchImpl: FetchLike = fetch): Promise<SourceResult> {
  return tryInOrder([fetchFrankfurter, fetchOpenErEurUsd], fetchImpl);
}

/**
 * EUR/COP derivada de EUR/USD y USD/COP (1 EUR = eurUsd × usdCop COP). La
 * fecha de vigencia es la más vieja de las dos (la derivada no es más fresca
 * que su insumo más viejo que su insumo más viejo).
 */
export function deriveEurCop(eurUsd: FetchedRate, usdCop: FetchedRate): FetchedRate {
  return {
    base: "EUR",
    quote: "COP",
    rate: trimRate(Number(eurUsd.rate) * Number(usdCop.rate)),
    asOf: eurUsd.asOf < usdCop.asOf ? eurUsd.asOf : usdCop.asOf,
    source: `derived:${eurUsd.source}+${usdCop.source}`,
  };
}
