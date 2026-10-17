/**
 * Dinero sin floats. Un Money es un entero en unidades menores (bigint) más
 * su moneda: COP tiene exponente 0 (1 COP = 1 unidad), USD exponente 2
 * (US$ 1 = 100 centavos). Nunca se guarda ni se calcula con number.
 */
import { CURRENCY_EXPONENT, type CurrencyCode } from "@/lib/db/types";

export type Money = { readonly amountMinor: bigint; readonly currency: CurrencyCode };

/** Crea un Money. Acepta bigint o un entero seguro de JS (p. ej. de la base). */
export function money(amountMinor: bigint | number, currency: CurrencyCode): Money {
  if (typeof amountMinor === "number" && !Number.isSafeInteger(amountMinor)) {
    throw new RangeError(`Importe en unidades menores inválido: ${amountMinor}`);
  }
  return { amountMinor: BigInt(amountMinor), currency };
}

/** Decimales de la unidad menor de una moneda. */
export function exponentOf(currency: CurrencyCode): number {
  return CURRENCY_EXPONENT[currency];
}

/** 10^exponente como bigint. */
export function scaleOf(currency: CurrencyCode): bigint {
  return 10n ** BigInt(exponentOf(currency));
}

function assertSameCurrency(a: Money, b: Money) {
  if (a.currency !== b.currency) {
    throw new TypeError(`No se pueden combinar ${a.currency} y ${b.currency} sin convertir`);
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountMinor + b.amountMinor, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountMinor - b.amountMinor, a.currency);
}

export function negate(a: Money): Money {
  return money(-a.amountMinor, a.currency);
}

/** Suma una lista de la misma moneda (la lista vacía da 0 en `currency`). */
export function sum(items: readonly Money[], currency: CurrencyCode): Money {
  return items.reduce((acc, m) => add(acc, m), money(0n, currency));
}

/** -1, 0 o 1, como en un sort. Ambos deben tener la misma moneda. */
export function compare(a: Money, b: Money): -1 | 0 | 1 {
  assertSameCurrency(a, b);
  return a.amountMinor < b.amountMinor ? -1 : a.amountMinor > b.amountMinor ? 1 : 0;
}

export function equals(a: Money, b: Money): boolean {
  return a.currency === b.currency && a.amountMinor === b.amountMinor;
}

export function isZero(a: Money): boolean {
  return a.amountMinor === 0n;
}

export function isNegative(a: Money): boolean {
  return a.amountMinor < 0n;
}

/** Valor para enviar a una columna bigint por PostgREST (string sin pérdida). */
export function toDbAmount(a: Money): string {
  return a.amountMinor.toString();
}
