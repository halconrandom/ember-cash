"use server";

/**
 * Server Actions del onboarding: usar la app solo, crear un household o ir a
 * aceptar una invitación.
 */
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import { householdErrorMessage } from "@/lib/households/errors";
import { extractInviteToken } from "@/lib/households/invites";
import { createClient } from "@/lib/supabase/server";

/** Estado que devuelven las acciones de formulario (para useActionState). */
export type FormState = { error: string | null };

/** "Usar solo yo": marca el onboarding como terminado sin household. */
export async function chooseAlone(): Promise<FormState> {
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ onboarded_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) return { error: "No se pudo guardar. Intenta de nuevo." };
  redirect("/");
}

/** "Crear household": crea el household con el usuario como owner. */
export async function createHousehold(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (name.length === 0) return { error: "Escribe un nombre para el household." };
  if (name.length > 80) return { error: "El nombre puede tener hasta 80 caracteres." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_household", { p_name: name });
  if (error) return { error: householdErrorMessage(error) };
  redirect("/");
}

/** "Unirme con una invitación": valida el link pegado y va a /invite/[token]. */
export async function goToInvite(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = extractInviteToken(String(formData.get("invite") ?? ""));
  if (!token) return { error: "Pega el link completo de la invitación." };
  redirect(`/invite/${token}`);
}
