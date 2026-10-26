/**
 * Dirección de una transferencia vista desde una cuenta filtrada: "in" si la
 * cuenta es el destino (abono, "+"), "out" si es el origen ("-"). Sin filtro
 * o si la fila no es transferencia, null (se usa el signo normal).
 * Solo presentación: no cambia totales.
 */
type Row = {
  kind: string;
  account: { id: string } | null;
  transferTo: { id: string } | null;
};

export function transferPerspective(row: Row, viewAccountId: string | null): "in" | "out" | null {
  if (!viewAccountId || row.kind !== "transfer" || !row.transferTo) return null;
  if (row.transferTo.id === viewAccountId) return "in";
  if (row.account?.id === viewAccountId) return "out";
  return null;
}
