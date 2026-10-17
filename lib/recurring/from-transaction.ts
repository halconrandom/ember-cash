/**
 * Qué recurrente crea el campo Repetir de una transacción.
 *
 * - Ingreso → día de cobro (income).
 * - Gasto de la categoría Suscripciones → suscripción.
 * - Otro gasto → factura (bill).
 * Ninguno se registra solo: cada vencimiento queda Por pagar hasta que
 * alguien lo marca como pagado.
 * - Transferencia o "Nunca" → no crea nada.
 * Solo al crear: editar una transacción no toca el recurrente (si no, cada
 * guardado duplicaría la serie).
 */
import type { RecurringFrequency, RecurringKind } from "@/lib/db/types";

import type { ValidTransaction } from "@/lib/transactions/schema";

export type Repeat = "never" | RecurringFrequency;

export type RecurringDraft = {
  kind: RecurringKind;
  frequency: RecurringFrequency;
  name: string;
  anchorDate: string;
};

/** Nombre de recurrente: la columna admite 80 caracteres; la descripción, 200. */
function recurringName(description: string): string {
  return description.length > 80 ? description.slice(0, 80) : description;
}

export function recurringFromTransaction(
  tx: ValidTransaction & { repeat: Repeat },
): RecurringDraft | null {
  if (tx.id || tx.repeat === "never" || tx.kind === "transfer") return null;
  const kind: RecurringKind =
    tx.kind === "income" ? "income" : tx.categoryKey === "subscriptions" ? "subscription" : "bill";
  return {
    kind,
    frequency: tx.repeat,
    name: recurringName(tx.description),
    anchorDate: tx.occurredOn,
  };
}
