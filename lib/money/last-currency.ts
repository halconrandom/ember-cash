/**
 * Última moneda usada en un formulario (transacción por tipo, metas, deudas,
 * suscripciones, cuentas...): conveniencia del navegador para el valor por
 * defecto del selector de 3 monedas. Nunca falla si no hay almacenamiento
 * (modo privado, bloqueado): simplemente no recuerda nada.
 */
import { CURRENCY_CODES, type CurrencyCode } from "@/lib/db/types";

export function readLastCurrency(formKey: string): CurrencyCode | null {
  try {
    const v = localStorage.getItem(`ec:lastCurrency:${formKey}`);
    return (CURRENCY_CODES as readonly string[]).includes(v ?? "") ? (v as CurrencyCode) : null;
  } catch {
    return null;
  }
}

export function writeLastCurrency(formKey: string, currency: CurrencyCode): void {
  try {
    localStorage.setItem(`ec:lastCurrency:${formKey}`, currency);
  } catch {
    // Almacenamiento no disponible: se ignora.
  }
}

/** Opciones del segmented de moneda (COP/USD/EUR), en el orden del catálogo. */
export const CURRENCY_OPTIONS = CURRENCY_CODES.map((value) => ({ value, label: value }));

/**
 * Monedas elegidas recientemente en cualquier <CurrencyPicker> de la app (no
 * por formulario, a diferencia de readLastCurrency/writeLastCurrency): la
 * fase E5 la usa para poner esas primero en la lista, antes del resto en
 * orden alfabético. Como máximo 3, la más reciente primero.
 */
const RECENT_KEY = "ec:recentCurrencies";
const MAX_RECENT = 3;

export function readRecentCurrencies(): CurrencyCode[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is CurrencyCode =>
      (CURRENCY_CODES as readonly string[]).includes(v),
    );
  } catch {
    return [];
  }
}

export function recordRecentCurrency(currency: CurrencyCode): void {
  try {
    const next = [currency, ...readRecentCurrencies().filter((c) => c !== currency)].slice(
      0,
      MAX_RECENT,
    );
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Almacenamiento no disponible: se ignora.
  }
}

/**
 * Orden de un <CurrencyPicker>: primero las recientes que sigan entre
 * `options` (en orden de uso), después el resto alfabético por código.
 */
export function orderCurrencyOptions(
  options: readonly CurrencyCode[],
  recent: readonly CurrencyCode[],
): CurrencyCode[] {
  const allowed = new Set(options);
  const recentInOptions = recent.filter((c) => allowed.has(c));
  const rest = options
    .filter((c) => !recentInOptions.includes(c))
    .toSorted((a, b) => a.localeCompare(b));
  return [...recentInOptions, ...rest];
}
