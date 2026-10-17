/**
 * Lee el scope actual de la cookie y lo valida: si apunta a un hogar del que
 * el usuario ya no es miembro, vuelve a Personal.
 */
import "server-only";

import { cookies } from "next/headers";
import { cache } from "react";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { PERSONAL_SCOPE, SCOPE_COOKIE, type Scope } from "./constants";

export const getScope = cache(async (): Promise<Scope> => {
  const value = (await cookies()).get(SCOPE_COOKIE)?.value;
  if (!value || value === "personal" || !z.uuid().safeParse(value).success) return PERSONAL_SCOPE;

  await requireUser();
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_household_member", { hid: value });
  return data ? { kind: "household", householdId: value } : PERSONAL_SCOPE;
});
