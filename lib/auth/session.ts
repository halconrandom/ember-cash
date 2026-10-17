/**
 * Acceso a la sesión y al perfil desde Server Components y Server Actions.
 * `cache` de React evita repetir la consulta dentro de la misma petición
 * (layout y página piden el usuario por separado).
 */
import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

/** Usuario autenticado actual, validado contra Supabase Auth, o null. */
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
});

/** Igual que getCurrentUser, pero redirige a /login si no hay sesión. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Perfil del usuario actual (RLS solo deja ver el propio). */
export const getCurrentProfile = cache(async () => {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  if (error) throw new Error(`No se pudo leer el perfil: ${error.message}`);
  return data;
});
