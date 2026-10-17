/**
 * Traduce los códigos de error de las funciones SQL (create_household,
 * accept_invite) a claves de messages/*.json (namespace "householdErrors").
 * El texto lo pone quien muestra el error, en el idioma del usuario.
 */

/**
 * Códigos de las funciones SQL de households.
 * accept_invite (0013) los devuelve en jsonb. not_authenticated sigue
 * lanzando excepción, porque sin sesión no hay a quién contarle el intento.
 */
export const HOUSEHOLD_ERROR_CODES = [
  "not_authenticated",
  "invite_invalid",
  "invite_used",
  "invite_expired",
  "already_member",
  "household_full",
  "invite_rate_limited",
] as const;

export type HouseholdErrorKey = (typeof HOUSEHOLD_ERROR_CODES)[number] | "generic";

/** Clave del mensaje para un error de Supabase ("generic" si no es conocido). */
export function householdErrorKey(
  error: { message?: string } | null | undefined,
): HouseholdErrorKey {
  const code = error?.message?.trim() ?? "";
  return (HOUSEHOLD_ERROR_CODES as readonly string[]).includes(code)
    ? (code as HouseholdErrorKey)
    : "generic";
}
