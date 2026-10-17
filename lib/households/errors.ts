/**
 * Traduce los códigos de error de las funciones SQL (create_household,
 * accept_invite) a mensajes para el usuario.
 */

/** Códigos que lanzan las funciones de 0001_auth_households.sql. */
const MESSAGES: Record<string, string> = {
  not_authenticated: "Tu sesión expiró. Vuelve a iniciar sesión.",
  invite_invalid: "Esta invitación no existe o el link está incompleto.",
  invite_used: "Esta invitación ya se usó. Pide un link nuevo.",
  invite_expired: "Esta invitación venció. Pide un link nuevo.",
  already_member: "Ya eres miembro de este household.",
  household_full: "Este household ya tiene el máximo de miembros.",
};

/** Mensaje genérico cuando el error no es uno de los conocidos. */
export const GENERIC_ERROR = "No se pudo completar la acción. Intenta de nuevo.";

/** Devuelve el mensaje para un error de Supabase (o el genérico). */
export function householdErrorMessage(error: { message?: string } | null | undefined): string {
  const code = error?.message?.trim() ?? "";
  return MESSAGES[code] ?? GENERIC_ERROR;
}
