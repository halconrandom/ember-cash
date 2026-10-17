/**
 * Cliente de Supabase para el servidor (Server Components, Route Handlers y
 * Server Actions). Lee y escribe la sesión en las cookies de la petición.
 * Usa la anon key: la service role key no se usa aquí para que las consultas
 * respeten RLS.
 */
import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";

import { getServerEnv } from "@/lib/env-server";

import type { Database } from "@/lib/db/types";

/** Crea un cliente de Supabase ligado a las cookies de la petición actual. */
export async function createClient() {
  // Marca el trabajo como "por petición": el cliente usa Date.now() y la
  // sesión del usuario, así que nunca debe prerenderizarse (cacheComponents).
  await connection();
  const env = getServerEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // En un Server Component no se pueden escribir cookies. Se ignora
            // porque proxy.ts ya refresca la sesión en cada petición.
          }
        },
      },
    },
  );
}
