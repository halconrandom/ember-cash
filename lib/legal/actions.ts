"use server";

/**
 * Guarda el consentimiento de la versión vigente. Solo se llama si la persona
 * marcó la casilla. Inserta privacy y terms por separado: si una ya existe,
 * la otra se puede completar al reintentar. El límite de escrituras lo cuenta
 * el disparador de la tabla; aquí no se vuelve a llamar consume_rate_limit.
 */
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { logServerError } from "@/lib/log/server";
import { isRateLimitedDbError } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";

import { CONSENT_TYPES, type ConsentActionResult } from "./consent";
import { LEGAL_VERSION } from "./version";

/** Crea las dos filas de LEGAL_VERSION para el usuario de la sesión. */
export async function acceptConsent(): Promise<ConsentActionResult> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  for (const type of CONSENT_TYPES) {
    const { error } = await supabase.from("consents").insert({ type, version: LEGAL_VERSION });
    // 23505: esa fila ya estaba. La otra puede faltar, así que se sigue.
    if (error && error.code !== "23505") {
      if (isRateLimitedDbError(error)) return { ok: false, error: "rateLimited" };
      logServerError("consent", error);
      return { ok: false, error: "saveFailed" };
    }
  }
  return { ok: true };
}
