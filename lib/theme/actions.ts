"use server";

/**
 * Guarda la preferencia de tema en profiles.theme. Si no hay sesión (login,
 * /dev/design-system) no hace nada: la cookie ya la guardó el cliente.
 */
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { isThemePreference } from "./constants";

export async function saveThemePreference(theme: string): Promise<{ ok: boolean }> {
  if (!isThemePreference(theme)) return { ok: false };
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ theme }).eq("id", user.id);
  return { ok: !error };
}
