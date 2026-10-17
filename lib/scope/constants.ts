/**
 * Scope de datos: "personal" (por defecto) o un hogar. Todas las consultas de
 * finanzas lo respetan: personal = filas con household_id nulo; hogar = filas
 * de ese hogar. El interruptor visible llega en la fase 10; por ahora el valor
 * vive en la cookie `ec-scope` ("personal" o el id del hogar).
 */
export const SCOPE_COOKIE = "ec-scope";
export const SCOPE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export type Scope = { kind: "personal" } | { kind: "household"; householdId: string };

export const PERSONAL_SCOPE: Scope = { kind: "personal" };

/** household_id que corresponde al scope (null = personal). */
export function scopeHouseholdId(scope: Scope): string | null {
  return scope.kind === "household" ? scope.householdId : null;
}
