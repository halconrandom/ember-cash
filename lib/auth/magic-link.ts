/**
 * Resultado visible del enlace mágico.
 *
 * No hay un registro aparte: el login pide el enlace con shouldCreateUser,
 * así que la cuenta se crea si no existía. La pantalla muestra lo mismo en
 * los dos casos. El texto que devuelve Supabase (cuenta ausente, ya
 * registrada, bloqueada) no se reenvía.
 */

/** Claves de messages login.errors que puede producir el envío. */
export type MagicLinkFailure = "rateLimited" | "sendFailed";

/**
 * null si el envío salió bien. Cualquier otro fallo, salvo el límite de
 * correos, es sendFailed: no se usa error.message.
 */
export function magicLinkFailure(
  error: { status?: number; message?: string } | null,
): MagicLinkFailure | null {
  if (!error) return null;
  return error.status === 429 ? "rateLimited" : "sendFailed";
}
