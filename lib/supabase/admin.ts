/**
 * Cliente de Supabase con la service role key: se salta RLS. Solo para tareas
 * del servidor que no actúan en nombre de un usuario (cron de tasas). Nunca
 * se importa desde código de cliente ("server-only" lo impide).
 */
import "server-only";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/db/types";
import { getServerEnv } from "@/lib/env";

export function createAdminClient() {
  const env = getServerEnv();
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
