/**
 * Traduce los códigos de error de las funciones SQL (create_household,
 * accept_invite) a claves de messages/*.json (namespace "householdErrors").
 * El texto lo pone quien muestra el error, en el idioma del usuario.
 */

/** Códigos que lanzan las funciones de 0001_auth_households.sql. */
export const HOUSEHOLD_ERROR_CODES = [
  "not_authenticated",
  "invite_invalid",
  "invite_used",
  "invite_expired",
  "already_member",
  "household_full",
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
