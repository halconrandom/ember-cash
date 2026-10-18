/**
 * Usuario fantasma al que se reasignan los datos compartidos de una cuenta
 * borrada (beta, B3). Vive de verdad en auth.users, creado una sola vez con
 * la Admin API (nunca con SQL directo: así Supabase garantiza que la fila
 * cumple su propio esquema, sin que esta app tenga que adivinarlo). No tiene
 * contraseña y su correo es del dominio reservado .invalid (RFC 2606), así
 * que nunca resuelve y nadie puede iniciar sesión con esa cuenta.
 *
 * public.deleted_account_sentinel (0017) guarda su id en una sola fila (sin
 * RLS para authenticated: solo lo toca este módulo, con la service role, y
 * la RPC delete_account_data, que la lee como SECURITY DEFINER).
 *
 * "server-only" impide que esto se importe desde código de cliente.
 */
import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

const SENTINEL_EMAIL = "deleted-user@ember-cash.invalid";

/**
 * Devuelve el id del usuario fantasma, creándolo la primera vez que hace
 * falta. Si dos borrados de cuenta corren a la vez y los dos intentan
 * crearlo, el que pierde la carrera (choca con la llave única de la tabla)
 * usa el que ganó: nunca quedan dos.
 */
export async function getOrCreateDeletedUserSentinel(): Promise<string> {
  const admin = createAdminClient();

  const { data: existing, error: readError } = await admin
    .from("deleted_account_sentinel")
    .select("user_id")
    .maybeSingle();
  if (readError) {
    throw new Error(`No se pudo leer el usuario fantasma: ${readError.message}`);
  }
  if (existing) return existing.user_id;

  const { data, error } = await admin.auth.admin.createUser({
    email: SENTINEL_EMAIL,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`No se pudo crear el usuario fantasma: ${error?.message}`);
  }

  const { error: insertError } = await admin
    .from("deleted_account_sentinel")
    .insert({ user_id: data.user.id });
  if (insertError) {
    // Carrera con otro borrado: alguien más ya lo creó primero. Se usa el
    // suyo y se borra la cuenta que acabamos de crear de más.
    const { data: winner } = await admin
      .from("deleted_account_sentinel")
      .select("user_id")
      .maybeSingle();
    if (winner) {
      await admin.auth.admin.deleteUser(data.user.id);
      return winner.user_id;
    }
    throw new Error(`No se pudo registrar el usuario fantasma: ${insertError.message}`);
  }

  return data.user.id;
}
