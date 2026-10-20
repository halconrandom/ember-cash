/**
 * Cupo y día de pago de una cuenta. Solo una tarjeta puede llevarlos; el
 * resto de los tipos los deja en null. El wizard exige los dos al crear la
 * tarjeta; Ajustes puede crear la tarjeta sin ellos (null).
 */
import type { AccountType } from "@/lib/db/types";

export type CreditColumns = {
  credit_limit_minor: number | null;
  payment_day: number | null;
};

/** Normaliza los campos o rechaza una combinación que la base no aceptaría. */
export function creditColumns(
  type: AccountType,
  limit: number | null | undefined,
  day: number | null | undefined,
): CreditColumns | null {
  const creditLimit = limit ?? null;
  const paymentDay = day ?? null;
  if (type !== "credit_card") {
    return creditLimit === null && paymentDay === null
      ? { credit_limit_minor: null, payment_day: null }
      : null;
  }
  if (creditLimit !== null && (!Number.isSafeInteger(creditLimit) || creditLimit <= 0)) return null;
  if (paymentDay !== null && (!Number.isInteger(paymentDay) || paymentDay < 1 || paymentDay > 31)) {
    return null;
  }
  return { credit_limit_minor: creditLimit, payment_day: paymentDay };
}
