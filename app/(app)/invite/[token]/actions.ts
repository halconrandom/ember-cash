"use server";

/**
 * Server Action para aceptar una invitación con la RPC accept_invite. El
 * error vuelve ya traducido.
 */
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { requireUser } from "@/lib/auth/session";
import { householdErrorKey } from "@/lib/households/errors";
import { readInviteResult } from "@/lib/households/invites";
import { isRateLimitedDbError, rateLimitText } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";

export type AcceptState = { error: string | null };

export async function acceptInvite(_prev: AcceptState, formData: FormData): Promise<AcceptState> {
  await requireUser();
  const token = String(formData.get("token") ?? "");

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_invite", { p_token: token });

  // not_authenticated sigue llegando como excepción de Postgres. El resto
  // llega en el jsonb, para que el intento quede guardado (ver 0013).
  // El tope de 8 intentos llega como invite_rate_limited. Si además se agotó
  // el cupo de escritura, Postgres lanza rate_limited.
  if (isRateLimitedDbError(error)) return { error: await rateLimitText("write") };
  const result = error ? { ok: false, error: error.message } : readInviteResult(data);

  // Si ya era miembro, no es un error para el usuario: lo llevamos adentro.
  if (!result.ok && result.error !== "already_member") {
    const t = await getTranslations("householdErrors");
    return { error: t(householdErrorKey({ message: result.error ?? "" })) };
  }
  redirect("/");
}
