"use server";

/**
 * Guarda un evento del usuario de la sesión. RLS y events_stamp ponen el
 * dueño y la hora. El disparador zz_rate_limit_write ya cuenta la escritura:
 * no se llama consume_rate_limit desde aquí.
 */
import { requireUser } from "@/lib/auth/session";
import type { Json } from "@/lib/db/types";
import { isRateLimitedDbError } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";

import { validateEvent, type EventName } from "./validate";

export type RecordResult =
  { ok: true } | { ok: false; error: "invalid" | "rateLimited" | "failed" };

async function insertEvent(name: EventName, props: Json): Promise<RecordResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("events").insert({ name, props });
  if (isRateLimitedDbError(error)) return { ok: false, error: "rateLimited" };
  if (error) return { ok: false, error: "failed" };
  return { ok: true };
}

/** Inserta el evento si el nombre y las props están en la lista cerrada. */
export async function recordEvent(name: EventName, props: unknown): Promise<RecordResult> {
  await requireUser();
  const valid = validateEvent(name, props);
  if (!valid) return { ok: false, error: "invalid" };
  return insertEvent(valid.name, valid.props);
}

/** Objeto de props que `.contains` acepta. `{}` no entra: está en cualquier fila. */
function filterProps(value: Json): Record<string, string | number> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  if (Object.keys(value).length === 0) return null;
  return value as Record<string, string | number>;
}

/**
 * Inserta una sola vez por nombre (y por props, si las hay). Sirve para
 * started, completed y cada paso: un reintento del wizard no duplica la
 * marca. Una carrera de dos peticiones puede dejar dos filas; el porcentaje
 * cuenta personas distintas, así que no cambia el resultado.
 */
export async function recordEventOnce(name: EventName, props: unknown): Promise<RecordResult> {
  await requireUser();
  const valid = validateEvent(name, props);
  if (!valid) return { ok: false, error: "invalid" };
  const supabase = await createClient();
  let query = supabase.from("events").select("id").eq("name", valid.name).limit(1);
  const filter = filterProps(valid.props);
  if (filter) query = query.contains("props", filter);
  const { data, error } = await query;
  if (error) return { ok: false, error: "failed" };
  if (data && data.length > 0) return { ok: true };
  return insertEvent(valid.name, valid.props);
}
