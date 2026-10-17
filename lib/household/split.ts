/**
 * Etiqueta del reparto de un gasto compartido ("50 / 50"): el porcentaje de
 * cada miembro, en el orden de la lista de miembros. Un gasto anterior al
 * ingreso de un miembro queda "100 / 0".
 */
import { divRound } from "@/lib/money/convert";

export function splitPercents(
  amountMinor: bigint,
  splits: readonly { userId: string; shareMinor: bigint }[],
  members: readonly string[],
): number[] {
  if (amountMinor <= 0n) return members.map(() => 0);
  return members.map((m) => {
    const share = splits.find((s) => s.userId === m)?.shareMinor ?? 0n;
    return Number(divRound(share * 100n, amountMinor));
  });
}
