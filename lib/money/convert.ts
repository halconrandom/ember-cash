/**
 * Conversión entre monedas con una tasa fechada.
 *
 * - Una tasa dice "1 `base` = `rate` `quote`" (como exchange_rates). Sirve en
 *   los dos sentidos: USD→COP multiplica, COP→USD divide.
 * - La tasa se maneja como decimal exacto (hasta 10 decimales, como la columna
 *   numeric(24,10)) y todo el cálculo es con bigint.
 * - Redondeo: al entero de unidades menores más cercano; las mitades se
 *   alejan de cero (0,5 → 1; -0,5 → -1). Es el redondeo comercial habitual y
 *   es simétrico para negativos.
 * - Los totales se convierten con la tasa más reciente: primero se suma por
 *   moneda y después se convierte cada suma una sola vez (menos redondeos).
 *
 * Fase E4 (5 monedas): ya no se guarda un par por cada cruce posible (10
 * pares entre 5 monedas, 20 si se cuentan ambos sentidos). Cada moneda
 * guarda solo su "pata a USD" (USD/COP, EUR/USD, USD/MXN, USD/ARS); un
 * cruce A→B que no esté guardado directo (p. ej. EUR→MXN) se deriva
 * triangulando por USD: 1 A = usdPerUnit(A) USD = usdPerUnit(A)/usdPerUnit(B)
 * B. `latestRateFor`/`rateAt` intentan primero el par directo (por si existe,
 * p. ej. USD→cualquiera) y solo si falta alguna de las dos patas a USD
 * derivan el cruce; si falta una, siguen devolviendo `null` (nunca se
 * inventa una tasa). `convert()` no cambia: sigue recibiendo una sola tasa
 * ya resuelta, directa o derivada.
 */
import type { CurrencyCode } from "@/lib/db/types";

import { add, money, scaleOf, type Money } from "./money";

/** Escala interna de la tasa: 10 decimales. */
const RATE_DECIMALS = 10;
const RATE_SCALE = 10n ** BigInt(RATE_DECIMALS);

/** Tasa serializable (llega del servidor tal cual). */
export type Rate = {
  base: CurrencyCode;
  quote: CurrencyCode;
  /** Decimal en texto, p. ej. "3174.67". */
  rate: string;
  /** Fecha de vigencia (AAAA-MM-DD). */
  asOf: string;
  /** Momento en que se obtuvo (ISO 8601). */
  fetchedAt: string;
  source: string;
};

/** "3174.67" → 31746700000000n (escalado a 10 decimales). Rechaza ≤ 0. */
export function parseRate(rate: string): bigint {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(rate.trim());
  if (!match) throw new RangeError(`Tasa inválida: ${rate}`);
  const [, int, frac = ""] = match;
  if (frac.length > RATE_DECIMALS && /[1-9]/.test(frac.slice(RATE_DECIMALS))) {
    throw new RangeError(`Tasa con más de ${RATE_DECIMALS} decimales: ${rate}`);
  }
  const scaled =
    BigInt(int) * RATE_SCALE + BigInt(frac.slice(0, RATE_DECIMALS).padEnd(RATE_DECIMALS, "0"));
  if (scaled <= 0n) throw new RangeError(`La tasa debe ser mayor que 0: ${rate}`);
  return scaled;
}

/** División entera con redondeo de mitades lejos de cero. */
export function divRound(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new RangeError("División por cero");
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  let q = n / d;
  if ((n % d) * 2n >= d) q += 1n;
  return negative ? -q : q;
}

/** Inversa de `parseRate`: el bigint escalado vuelve a un decimal en texto. */
function formatRateScaled(scaled: bigint): string {
  if (scaled <= 0n) throw new RangeError("Tasa derivada inválida");
  const intPart = scaled / RATE_SCALE;
  const fracPart = (scaled % RATE_SCALE).toString().padStart(RATE_DECIMALS, "0");
  const frac = fracPart.replace(/0+$/, "");
  return frac ? `${intPart}.${frac}` : `${intPart}`;
}

/**
 * La tasa (en cualquier sentido) entre `currency` y USD, de entre las
 * dadas: la más reciente. `null` si `currency` es USD (no hace falta pata)
 * o si no hay ninguna.
 */
function usdLeg(rates: readonly Rate[], currency: CurrencyCode): Rate | null {
  if (currency === "USD") return null;
  const candidates = rates.filter(
    (r) =>
      (r.base === currency && r.quote === "USD") || (r.base === "USD" && r.quote === currency),
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (b.asOf > a.asOf ? b : a));
}

/** "1 unidad de `currency` en USD", como bigint escalado a RATE_SCALE. */
function usdPerUnitScaled(leg: Rate, currency: CurrencyCode): bigint {
  const r = parseRate(leg.rate);
  if (leg.base === currency && leg.quote === "USD") return r; // 1 currency = r USD
  // leg.base === "USD" && leg.quote === currency: 1 USD = r currency.
  return divRound(RATE_SCALE * RATE_SCALE, r);
}

/**
 * Deriva la tasa `from`→`to` triangulando por USD (ninguna de las dos es
 * USD, o falta el par directo entre ellas). `null` si falta la pata a USD
 * de `from` o de `to`: nunca se inventa una tasa con una sola pata.
 */
function deriveViaUsd(rates: readonly Rate[], from: CurrencyCode, to: CurrencyCode): Rate | null {
  const legFrom = usdLeg(rates, from);
  const legTo = usdLeg(rates, to);
  if (from !== "USD" && !legFrom) return null;
  if (to !== "USD" && !legTo) return null;

  const pFrom = from === "USD" ? RATE_SCALE : usdPerUnitScaled(legFrom!, from);
  const pTo = to === "USD" ? RATE_SCALE : usdPerUnitScaled(legTo!, to);
  const rateScaled = divRound(pFrom * RATE_SCALE, pTo);

  const legs = [legFrom, legTo].filter((l): l is Rate => l !== null);
  // La derivada no es más fresca que su insumo más viejo.
  const oldest = legs.reduce((a, b) => (b.asOf < a.asOf ? b : a));
  const earliestFetch = legs.reduce((a, b) => (b.fetchedAt < a.fetchedAt ? b : a));

  return {
    base: from,
    quote: to,
    rate: formatRateScaled(rateScaled),
    asOf: oldest.asOf,
    fetchedAt: earliestFetch.fetchedAt,
    source: `derived:${legs.map((l) => `${l.base}/${l.quote}`).join("+")}`,
  };
}

/** La tasa directa `from`/`to` (en cualquier sentido) más reciente entre las dadas. */
function directRateFor(rates: readonly Rate[], from: CurrencyCode, to: CurrencyCode): Rate | null {
  const candidates = rates.filter(
    (r) => (r.base === from && r.quote === to) || (r.base === to && r.quote === from),
  );
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (b.asOf > a.asOf ? b : a));
}

/** Convierte `m` a `to` con la tasa dada. Si ya está en `to`, lo devuelve igual. */
export function convert(
  m: Money,
  to: CurrencyCode,
  rate: Pick<Rate, "base" | "quote" | "rate">,
): Money {
  if (m.currency === to) return m;
  const r = parseRate(rate.rate);
  const fromScale = scaleOf(m.currency);
  const toScale = scaleOf(to);

  if (rate.base === m.currency && rate.quote === to) {
    // base → quote: multiplica por la tasa.
    return money(divRound(m.amountMinor * r * toScale, fromScale * RATE_SCALE), to);
  }
  if (rate.base === to && rate.quote === m.currency) {
    // quote → base: divide por la tasa.
    return money(divRound(m.amountMinor * RATE_SCALE * toScale, r * fromScale), to);
  }
  throw new TypeError(`La tasa ${rate.base}/${rate.quote} no sirve para ${m.currency}→${to}`);
}

/**
 * Total en `to` de importes en varias monedas: suma por moneda y convierte
 * cada suma una vez con la tasa (la más reciente).
 */
export function totalIn(
  items: readonly Money[],
  to: CurrencyCode,
  rate: Pick<Rate, "base" | "quote" | "rate">,
): Money {
  const byCurrency = new Map<CurrencyCode, Money>();
  for (const item of items) {
    const prev = byCurrency.get(item.currency);
    byCurrency.set(item.currency, prev ? add(prev, item) : item);
  }
  let total = money(0n, to);
  for (const subtotal of byCurrency.values()) total = add(total, convert(subtotal, to, rate));
  return total;
}

/**
 * Busca, en una lista de tasas (como las que guarda <RateProvider>), la más
 * reciente para el par `from`/`to` en cualquier sentido. `null` si no hay
 * ninguna (nunca se inventa): quien llama decide qué mostrar.
 */
export function latestRateFor(
  rates: readonly Rate[],
  from: CurrencyCode,
  to: CurrencyCode,
): Rate | null {
  if (from === to) return null;
  return directRateFor(rates, from, to) ?? deriveViaUsd(rates, from, to);
}

/**
 * Como `latestRateFor`, pero solo entre las tasas vigentes el `date` dado o
 * antes (fase E2 §4: "la tasa de exchange_rates de la fecha del
 * movimiento"). `null` si no hay ninguna tasa tan vieja como esa fecha.
 */
export function rateAt(
  rates: readonly Rate[],
  from: CurrencyCode,
  to: CurrencyCode,
  date: string,
): Rate | null {
  return latestRateFor(
    rates.filter((r) => r.asOf <= date),
    from,
    to,
  );
}

/** ¿La tasa tiene más de 24 h desde que se obtuvo? (estado "Stale", spec §4.9). */
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
export function isStale(rate: Pick<Rate, "fetchedAt">, now: number = Date.now()): boolean {
  return now - new Date(rate.fetchedAt).getTime() > STALE_AFTER_MS;
}
