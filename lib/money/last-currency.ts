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
