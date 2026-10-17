/**
 * Estado de una meta de ahorro. Se calcula al mostrarla; nunca se guarda.
 *
 * Regla (DESIGN_SPEC §1 e IVERN_FIXES §3, un color por estado):
 *
 * 1. "almostThere" (positive-text): lo ahorrado es el 95 % o más del
 *    objetivo. Gana sobre las demás reglas, aunque la fecha ya haya pasado.
 * 2. Si la meta no tiene fecha objetivo: "onTrack" (sin plazo no hay atraso).
 * 3. Si tiene fecha, se compara lo ahorrado con lo esperado en línea recta
 *    entre started_on y target_date:
 *        esperado = objetivo × días transcurridos / días totales
 *    con los días transcurridos limitados al rango [0, días totales]. Antes
 *    de empezar se espera 0; desde la fecha objetivo en adelante, el 100 %.
 *    Si target_date no es posterior a started_on, se espera el 100 %.
 *    - ahorrado ≥ esperado → "onTrack" (positive-text)
 *    - ahorrado < esperado → "behind" (amber-text)
 *
 * Todo se calcula con enteros (bigint y días enteros), sin floats.
 */

export type GoalStatus = "onTrack" | "behind" | "almostThere";

export type GoalStatusInput = {
  /** Ahorrado y objetivo en la misma moneda (unidades menores). */
  savedMinor: bigint;
  targetMinor: bigint;
  /** Fechas AAAA-MM-DD. */
  startedOn: string;
  targetDate: string | null;
  today: string;
};

/** Umbral de "Almost there": 95 %. */
export const ALMOST_THERE_PERCENT = 95n;

/** Días enteros entre dos fechas AAAA-MM-DD (b - a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

export function goalStatus({
  savedMinor,
  targetMinor,
  startedOn,
  targetDate,
  today,
}: GoalStatusInput): GoalStatus {
  if (targetMinor > 0n && savedMinor * 100n >= targetMinor * ALMOST_THERE_PERCENT)
    return "almostThere";
  if (!targetDate) return "onTrack";

  const total = daysBetween(startedOn, targetDate);
  if (total <= 0) return savedMinor >= targetMinor ? "onTrack" : "behind";

  const elapsed = Math.min(Math.max(daysBetween(startedOn, today), 0), total);
  // ahorrado ≥ objetivo × transcurridos / totales, sin dividir.
  return savedMinor * BigInt(total) >= targetMinor * BigInt(elapsed) ? "onTrack" : "behind";
}

/** Porcentaje entero (hacia abajo) de lo ahorrado sobre el objetivo, entre 0 y 100. */
export function goalPercent(savedMinor: bigint, targetMinor: bigint): number {
  if (targetMinor <= 0n) return 0;
  const p = (savedMinor * 100n) / targetMinor;
  return Number(p > 100n ? 100n : p < 0n ? 0n : p);
}
