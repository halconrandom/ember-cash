"use server";

/** Cambia el scope (lo usará el interruptor de la fase 10). */
import { cookies } from "next/headers";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";

import { SCOPE_COOKIE, SCOPE_COOKIE_MAX_AGE } from "./constants";

export async function setScope(value: string): Promise<{ ok: boolean }> {
  await requireUser();
  if (value !== "personal") {
    if (!z.uuid().safeParse(value).success) return { ok: false };
    const supabase = await createClient();
    const { data } = await supabase.rpc("is_household_member", { hid: value });
    if (!data) return { ok: false };
  }
  // Solo cambia una cookie: no hay fila que dispare el límite en la base.
  const limit = await consumeRateLimit("write");
  if (!limit.allowed) return { ok: false };
  (await cookies()).set(SCOPE_COOKIE, value, {
    path: "/",
    maxAge: SCOPE_COOKIE_MAX_AGE,
    sameSite: "lax",
  });
  return { ok: true };
}
