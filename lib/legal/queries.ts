/**
 * Lectura de los consentimientos de la sesión. La usa el layout para decidir
 * si pinta la app, y la exportación para no entregar el archivo sin ellos.
 */
import "server-only";

import { logServerError } from "@/lib/log/server";
import { createClient } from "@/lib/supabase/server";

/** Filas propias (RLS). Si la consulta falla, lista vacía: no se usa la app. */
export async function listOwnCurrentConsents(): Promise<{ type: string; version: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("consents").select("type, version");
  if (error) {
    // La migración se aplica con db:push. Hasta entonces, o si la lectura
    // falla, la pantalla de consentimiento bloquea en vez de dejar pasar.
    logServerError("consent", error);
    return [];
  }
  return data ?? [];
}
