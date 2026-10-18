/**
 * Límites por usuario (auditoría M-04). La cuenta vive en Postgres
 * (`consume_rate_limit`, migración 0015): exportación, enlaces y escrituras.
 *
 * Si la función todavía no está en el proyecto (la migración se aplica con
 * `pnpm db:push`, que no corre sola), un error de red o de "función
 * inexistente" deja pasar la acción. Un "no" explícito sí bloquea. Así un
 * despliegue no deja a la persona sin poder guardar antes de aplicar la
 * migración. El disparador de la base, cuando ya está, no tiene ese hueco:
 * rechaza la fila aunque la llamada no pase por aquí.
 */
import "server-only";

import { getTranslations } from "next-intl/server";

import { logServerError } from "@/lib/log/server";
import { createClient } from "@/lib/supabase/server";

/** Acciones con tope propio. Los números están en la función SQL. */
export type RateAction = "export" | "invite_create" | "invite_accept" | "write";

export type RateDecision = { allowed: true } | { allowed: false; retryAfter: number };

/** True si Postgres rechazó la fila por el límite (`rate_limited`, 0015). */
export function isRateLimitedDbError(error: { message?: string } | null | undefined): boolean {
  return error?.message === "rate_limited";
}

/**
 * Código de error para la UI. Si la base dijo rate_limited, no se disfraza
 * de un fallo genérico: la pantalla puede mostrar el texto de rateLimit.
 */
export function limitOr<F extends string>(
  error: { message?: string } | null | undefined,
  fallback: F,
): F | "rateLimited" {
  return isRateLimitedDbError(error) ? "rateLimited" : fallback;
}

/** Lee el jsonb de consume_rate_limit. retry_after es segundos, mínimo 1. */
export function decisionFromPayload(data: unknown): RateDecision {
  if (!data || typeof data !== "object") return { allowed: true };
  const row = data as { allowed?: unknown; retry_after?: unknown };
  if (row.allowed !== false) return { allowed: true };
  const retry = typeof row.retry_after === "number" ? row.retry_after : Number(row.retry_after);
  const retryAfter = Number.isFinite(retry) && retry >= 1 ? Math.ceil(retry) : 60;
  return { allowed: false, retryAfter };
}

/**
 * Gasta un cupo del usuario de la sesión. Si la llamada falla (migración
 * pendiente, red), deja pasar y lo anota en el log, sin el detalle al cliente.
 */
export async function consumeRateLimit(action: RateAction): Promise<RateDecision> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("consume_rate_limit", { p_action: action });
    if (error) {
      logServerError("rate_limit", error);
      return { allowed: true };
    }
    return decisionFromPayload(data);
  } catch (error) {
    logServerError("rate_limit", error);
    return { allowed: true };
  }
}

/** Frase ya traducida (es o en) para mostrar cuando el límite se agotó. */
export async function rateLimitText(kind: "write" | "export" | "inviteCreate"): Promise<string> {
  const t = await getTranslations("rateLimit");
  return t(kind);
}
