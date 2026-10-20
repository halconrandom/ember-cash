"use server";

/**
 * Server Actions de moneda:
 * - refreshRates: lo usan el chip (clic en estado "Stale") y el botón Retry.
 *   Si la tasa más reciente de los 3 pares se obtuvo hace menos de 15
 *   minutos la devuelve sin consultar las fuentes (evita abusar de ellas con
 *   clics repetidos).
 * - saveDisplayCurrency: guarda profiles.display_currency (COP, USD o EUR).
 */
import { requireUser } from "@/lib/auth/session";
import { CURRENCY_CODES } from "@/lib/db/types";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";

import type { Rate } from "./convert";
import { fetchAndStoreRates, listRates } from "./rates";

/** Ventana en la que no se vuelve a consultar las fuentes. */
const REFRESH_COOLDOWN_MS = 15 * 60 * 1000;

export type RefreshRatesResult = { ok: boolean; rates: Rate[] };

export async function refreshRates(): Promise<RefreshRatesResult> {
  await requireUser();
  const latest = await listRates();
  const mostRecentFetch = latest.reduce(
    (max, r) => Math.max(max, new Date(r.fetchedAt).getTime()),
    0,
  );
  if (latest.length > 0 && Date.now() - mostRecentFetch < REFRESH_COOLDOWN_MS) {
    return { ok: true, rates: latest };
  }
  // La escritura de la tasa usa la service role: el disparador no se la
  // cuenta a esta persona. El cupo de escritura sí, antes de salir a la red.
  const limit = await consumeRateLimit("write");
  if (!limit.allowed) return { ok: false, rates: latest };
  const result = await fetchAndStoreRates();
  // Si todas las fuentes fallan se informa el error y se conservan las últimas tasas.
  const anyOk = result.usdCop.ok || result.eurUsd.ok || result.eurCop.ok;
  return { ok: anyOk, rates: anyOk ? await listRates() : latest };
}

export async function saveDisplayCurrency(currency: string): Promise<{ ok: boolean }> {
  if (!(CURRENCY_CODES as readonly string[]).includes(currency)) return { ok: false };
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ display_currency: currency })
    .eq("id", user.id);
  return { ok: !error };
}
