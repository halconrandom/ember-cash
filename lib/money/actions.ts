"use server";

/**
 * Server Actions de moneda:
 * - refreshRate: lo usan el chip (clic en estado "Stale") y el botón Retry.
 *   Si la última tasa se obtuvo hace menos de 15 minutos la devuelve sin
 *   consultar las fuentes (evita abusar de ellas con clics repetidos).
 * - saveDisplayCurrency: guarda profiles.display_currency.
 */
import { requireUser } from "@/lib/auth/session";
import type { CurrencyCode } from "@/lib/db/types";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";

import type { Rate } from "./convert";
import { fetchAndStoreRate, getLatestRate } from "./rates";

/** Ventana en la que no se vuelve a consultar las fuentes. */
const REFRESH_COOLDOWN_MS = 15 * 60 * 1000;

export type RefreshRateResult = { ok: true; rate: Rate } | { ok: false; rate: Rate | null };

export async function refreshRate(): Promise<RefreshRateResult> {
  await requireUser();
  const latest = await getLatestRate();
  if (latest && Date.now() - new Date(latest.fetchedAt).getTime() < REFRESH_COOLDOWN_MS) {
    return { ok: true, rate: latest };
  }
  // La escritura de la tasa usa la service role: el disparador no se la
  // cuenta a esta persona. El cupo de escritura sí, antes de salir a la red.
  const limit = await consumeRateLimit("write");
  if (!limit.allowed) return { ok: false, rate: latest };
  const result = await fetchAndStoreRate();
  // Si ambas fuentes fallan se informa el error y se conserva la última tasa.
  return result.ok ? { ok: true, rate: result.rate } : { ok: false, rate: latest };
}

const CURRENCIES: readonly CurrencyCode[] = ["COP", "USD"];

export async function saveDisplayCurrency(currency: string): Promise<{ ok: boolean }> {
  if (!(CURRENCIES as readonly string[]).includes(currency)) return { ok: false };
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ display_currency: currency })
    .eq("id", user.id);
  return { ok: !error };
}
