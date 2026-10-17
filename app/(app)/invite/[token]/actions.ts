"use server";

/**
 * Server Action para aceptar una invitación con la RPC accept_invite. El
 * error vuelve ya traducido.
 */
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { requireUser } from "@/lib/auth/session";
import { householdErrorKey } from "@/lib/households/errors";
import { createClient } from "@/lib/supabase/server";

export type AcceptState = { error: string | null };

export async function acceptInvite(_prev: AcceptState, formData: FormData): Promise<AcceptState> {
  await requireUser();
  const token = String(formData.get("token") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_invite", { p_token: token });

  // Si ya era miembro, no es un error para el usuario: lo llevamos adentro.
  if (error && error.message !== "already_member") {
    const t = await getTranslations("householdErrors");
    return { error: t(householdErrorKey(error)) };
  }
  redirect("/");
}
