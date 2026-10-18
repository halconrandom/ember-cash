"use server";

/**
 * Eliminar cuenta y datos (beta, B3). Dos pasos, los dos verificados en el
 * servidor:
 *
 * 1. delete_account_data (RPC, con el cliente normal del usuario, nunca la
 *    service role): valida que no haya saldo pendiente ni un hogar con más
 *    gente a su cargo, y si todo está bien, anonimiza lo compartido y borra
 *    los hogares donde era el único miembro. Ver supabase/migrations/
 *    0017_account_deletion.sql para la explicación completa.
 * 2. Solo si el paso 1 devuelve ok:true, se borra la cuenta de verdad con la
 *    Admin API (createAdminClient, server-only), que en cascada se lleva el
 *    perfil y todos los datos personales que quedaban (transacciones, metas,
 *    deudas, cuentas, presupuestos, recurrentes, consentimientos).
 *
 * getCurrentUser()/requireUser() ya verifica la sesión con auth.getUser()
 * (nunca getSession): la Admin API solo se usa después de esa verificación,
 * y siempre contra el id de la sesión actual, nunca uno que mande el cliente.
 */
import { requireUser } from "@/lib/auth/session";
import { getOrCreateDeletedUserSentinel } from "@/lib/auth/deleted-user-sentinel";
import { logServerError } from "@/lib/log/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Códigos que devuelve delete_account_data en su jsonb, o la excepción de sesión. */
const DELETE_ERROR_CODES = [
  "not_authenticated",
  "balance_not_settled",
  "owns_household_with_members",
  "rate_limited",
] as const;
type DeleteErrorCode = (typeof DELETE_ERROR_CODES)[number] | "generic";

function errorCode(message: string | undefined): DeleteErrorCode {
  const code = message?.trim() ?? "";
  return (DELETE_ERROR_CODES as readonly string[]).includes(code)
    ? (code as DeleteErrorCode)
    : "generic";
}

export type DeleteAccountResult =
  { ok: true } | { ok: false; code: DeleteErrorCode; household: string | null };

export async function deleteAccount(): Promise<DeleteAccountResult> {
  const user = await requireUser();

  // Garantiza que exista antes de llamar a la RPC, que la busca ella sola
  // (lee deleted_account_sentinel); por eso no hace falta pasarle el id.
  try {
    await getOrCreateDeletedUserSentinel();
  } catch (error) {
    logServerError("delete_account.sentinel", error);
    return { ok: false, code: "generic", household: null };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("delete_account_data");
  if (error) {
    logServerError("delete_account.rpc", error);
    return { ok: false, code: errorCode(error.message), household: null };
  }

  const result = data as { ok: boolean; error?: string; household?: string } | null;
  if (!result?.ok) {
    return {
      ok: false,
      code: errorCode(result?.error),
      household: result?.household ?? null,
    };
  }

  // A partir de aquí ya no hay vuelta atrás: los datos personales y
  // compartidos quedaron resueltos. Falta borrar la cuenta de verdad.
  const admin = createAdminClient();
  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    // Caso raro: los datos ya se limpiaron pero la cuenta de Auth sigue.
    // Se registra para resolverlo a mano; no hay manera segura de reintentar
    // sola (el RPC ya se corrió y no es necesario repetirlo).
    logServerError("delete_account.admin_delete", deleteError);
    return { ok: false, code: "generic", household: null };
  }

  // Mejor esfuerzo: limpia las cookies de esta sesión. Si falla (la cuenta ya
  // no existe), no importa: la próxima petición ya no encuentra un usuario
  // válido y el proxy manda a /login de todas formas.
  try {
    await supabase.auth.signOut();
  } catch (error) {
    logServerError("delete_account.sign_out", error);
  }

  return { ok: true };
}
