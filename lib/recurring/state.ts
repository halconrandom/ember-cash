/**
 * Estado visible de un vencimiento pendiente (desde 0.10.2 nada se registra
 * solo):
 *   - "overdue" (Vencida): la base ya lo marcó así (cron) o su fecha pasó y
 *     el cron todavía no corrió.
 *   - "due" (Por pagar): vence hoy.
 *   - "upcoming": vence más adelante.
 * Solo "Marcar como pagado" lo saca de la lista.
 */
export type PendingStatus = "scheduled" | "overdue";
export type OccurrenceState = "upcoming" | "due" | "overdue";

export function occurrenceState(
  status: PendingStatus,
  dueOn: string,
  today: string,
): OccurrenceState {
  if (status === "overdue" || dueOn < today) return "overdue";
  return dueOn === today ? "due" : "upcoming";
}

/** ¿Se muestra con "Marcar como pagado" destacado? */
export function needsAction(state: OccurrenceState): boolean {
  return state !== "upcoming";
}
