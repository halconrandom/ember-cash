/**
 * GET /api/cron/purge-deleted
 * Cron diario (vercel.json), protegido con CRON_SECRET. Borra de forma
 * definitiva las transacciones y deudas marcadas como borradas hace más de un
 * día (por ejemplo, si el usuario cerró la pestaña antes de que venciera el
 * toast).
 */
import { timingSafeEqual } from "node:crypto";

import { getServerEnv } from "@/lib/env-server";
import { logServerError } from "@/lib/log/server";
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
  const admin = createAdminClient();
  const tx = await admin.from("transactions").delete({ count: "exact" }).lt("deleted_at", cutoff);
  if (tx.error) {
    logServerError("cron.purge-deleted", tx.error);
    return Response.json({ ok: false, error: "failed" }, { status: 500 });
  }
  const debts = await admin.from("debts").delete({ count: "exact" }).lt("deleted_at", cutoff);
  if (debts.error) {
    logServerError("cron.purge-deleted", debts.error);
    return Response.json({ ok: false, error: "failed" }, { status: 500 });
  }
  return Response.json({ ok: true, purged: (tx.count ?? 0) + (debts.count ?? 0) });
}
