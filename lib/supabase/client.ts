/**
 * Cliente de Supabase para componentes de cliente ("use client").
 * Usa solo la URL y la anon key públicas; la seguridad real la darán las
 * políticas RLS de la base de datos (fases posteriores).
 */
import { createBrowserClient } from "@supabase/ssr";

import { getPublicEnv } from "@/lib/env";

import type { Database } from "./database.types";

/** Crea un cliente de Supabase para el navegador. */
export function createClient() {
  const env = getPublicEnv();
  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
