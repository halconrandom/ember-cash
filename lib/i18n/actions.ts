"use server";

/**
 * Cambia el idioma: escribe la cookie ec-locale (la lee el servidor en cada
 * render) y, si se pide y hay sesión, profiles.locale. Al cambiar una cookie
 * en una Server Action, Next vuelve a renderizar la página con el idioma nuevo.
 */
import { cookies } from "next/headers";

import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { isLocale, LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from "./config";

export async function saveLocale(
  locale: string,
  options: { persist?: boolean } = {},
): Promise<{ ok: boolean }> {
  if (!isLocale(locale)) return { ok: false };

  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: "lax",
  });

  if (options.persist === false) return { ok: true };
  const user = await getCurrentUser();
  if (!user) return { ok: true };

  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ locale }).eq("id", user.id);
  return { ok: !error };
}
