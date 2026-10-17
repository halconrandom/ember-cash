"use server";

/**
 * Server Actions del onboarding: usar la app solo, crear un hogar o ir a
 * aceptar una invitación. Los errores vuelven ya traducidos.
 */
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { requireUser } from "@/lib/auth/session";
import { householdErrorKey } from "@/lib/households/errors";
import { extractInviteToken } from "@/lib/households/invites";
import { createClient } from "@/lib/supabase/server";

/** Estado que devuelven las acciones de formulario (para useActionState). */
export type FormState = { error: string | null };

/** "Usar solo yo": marca el onboarding como terminado sin hogar. */
export async function chooseAlone(): Promise<FormState> {
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ onboarded_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) return { error: (await getTranslations("onboarding.errors"))("saveFailed") };
  redirect("/");
}

/** "Crear hogar": crea el hogar con el usuario como admin. */
export async function createHousehold(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const t = await getTranslations();
  const name = String(formData.get("name") ?? "").trim();
  if (name.length === 0) return { error: t("onboarding.errors.nameRequired") };
  if (name.length > 80) return { error: t("onboarding.errors.nameTooLong") };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_household", { p_name: name });
  if (error) return { error: t(`householdErrors.${householdErrorKey(error)}`) };
  redirect("/");
}

/** "Unirme con una invitación": valida el enlace pegado y va a /invite/[token]. */
export async function goToInvite(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = extractInviteToken(String(formData.get("invite") ?? ""));
  if (!token) return { error: (await getTranslations("onboarding.errors"))("inviteInvalid") };
  redirect(`/invite/${token}`);
}
