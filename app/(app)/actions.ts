"use server";

/**
 * Server Actions de la página principal.
 */
import { headers } from "next/headers";

import { requireUser } from "@/lib/auth/session";
import { buildInviteUrl, generateInviteToken, hashInviteToken } from "@/lib/households/invites";
import { createClient } from "@/lib/supabase/server";

/** Resultado de crear un link de invitación. */
export type InviteLinkResult = { ok: true; url: string } | { ok: false; error: string };

/**
 * Genera un link de invitación para un household. El token se crea aquí y en
 * la base solo se guarda su hash. RLS impide que alguien que no sea owner
 * inserte la invitación.
 */
export async function createInviteLink(householdId: string): Promise<InviteLinkResult> {
  await requireUser();
  const supabase = await createClient();

  const token = generateInviteToken();
  const { error } = await supabase
    .from("household_invites")
    .insert({ household_id: householdId, token_hash: hashInviteToken(token) });

  if (error) {
    // 42501 = RLS rechazó el insert: el usuario no es owner.
    return {
      ok: false,
      error:
        error.code === "42501"
          ? "Solo el owner del household puede invitar."
          : "No se pudo crear la invitación. Intenta de nuevo.",
    };
  }

  return { ok: true, url: buildInviteUrl(await requestOrigin(), token) };
}

/** Origen (protocolo + host) de la petición actual, para armar links. */
async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
