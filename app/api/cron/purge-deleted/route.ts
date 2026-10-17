/**
 * GET /api/cron/purge-deleted
 * Cron diario (vercel.json), protegido con CRON_SECRET. Borra de forma
 * definitiva las transacciones marcadas como borradas hace más de un día (por
 * ejemplo, si el usuario cerró la pestaña antes de que venciera el toast).
 */
import { timingSafeEqual } from "node:crypto";

import { getServerEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

function authorized(header: string | null, secret: string): boolean {
  const expected = Buffer.from(`Bearer ${secret}`);
  const received = Buffer.from(header ?? "");
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export async function GET(request: Request) {
  const { CRON_SECRET } = getServerEnv();
  if (!authorized(request.headers.get("authorization"), CRON_SECRET)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { error, count } = await createAdminClient()
    .from("transactions")
    .delete({ count: "exact" })
    .lt("deleted_at", cutoff);
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
  return Response.json({ ok: true, purged: count ?? 0 });
}
