"use server";

/**
 * Gestión mínima de cuentas (Ajustes y el modal de transacción): crear,
 * renombrar, archivar y desarchivar. Validación con zod; RLS hace el resto.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { ACCOUNT_TYPES } from "@/lib/categories";
import { scopeHouseholdId } from "@/lib/scope/constants";
import { getScope } from "@/lib/scope/server";
import { createClient } from "@/lib/supabase/server";

export type AccountActionResult =
  | { ok: true; id: string }
  | { ok: false; error: "nameRequired" | "nameTooLong" | "invalid" | "failed" };

const nameSchema = z.string().trim().min(1, "nameRequired").max(80, "nameTooLong");

function nameError(name: unknown): "nameRequired" | "nameTooLong" | null {
  const r = nameSchema.safeParse(name);
  return r.success ? null : (r.error.issues[0].message as "nameRequired" | "nameTooLong");
}

const createSchema = z.object({
  name: z.string(),
  type: z.enum(ACCOUNT_TYPES),
  currency: z.enum(["COP", "USD"]),
});

export async function createAccount(input: unknown): Promise<AccountActionResult> {
  await requireUser();
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const err = nameError(parsed.data.name);
  if (err) return { ok: false, error: err };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("accounts")
    .insert({
      name: parsed.data.name.trim(),
      type: parsed.data.type,
      currency: parsed.data.currency,
      household_id: scopeHouseholdId(await getScope()),
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: "failed" };
  revalidatePath("/", "layout");
  return { ok: true, id: data.id };
}

export async function renameAccount(id: string, name: string): Promise<AccountActionResult> {
  await requireUser();
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "invalid" };
  const err = nameError(name);
  if (err) return { ok: false, error: err };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("accounts")
    .update({ name: name.trim() }, { count: "exact" })
    .eq("id", id);
  if (error || count === 0) return { ok: false, error: "failed" };
  revalidatePath("/", "layout");
  return { ok: true, id };
}

export async function setAccountArchived(
  id: string,
  archived: boolean,
): Promise<AccountActionResult> {
  await requireUser();
  if (!z.uuid().safeParse(id).success) return { ok: false, error: "invalid" };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("accounts")
    .update({ archived_at: archived ? new Date().toISOString() : null }, { count: "exact" })
    .eq("id", id);
  if (error || count === 0) return { ok: false, error: "failed" };
  revalidatePath("/", "layout");
  return { ok: true, id };
}
