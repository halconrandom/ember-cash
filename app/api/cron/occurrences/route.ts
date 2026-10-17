/**
 * GET /api/cron/occurrences
 * Lo llama el cron diario de Vercel (vercel.json) con el encabezado
 * `Authorization: Bearer <CRON_SECRET>`. Materializa vencimientos y marca
 * como vencidos los que pasaron sin confirmar. Nunca crea transacciones (ver
 * lib/recurring/cron.ts).
 */
import { timingSafeEqual } from "node:crypto";

import { getServerEnv } from "@/lib/env-server";
import { runOccurrencesCron } from "@/lib/recurring/cron";

/** Compara el encabezado con el secreto en tiempo constante. */
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

  try {
    const result = await runOccurrencesCron();
    if (!result.ok) return Response.json(result, { status: 500 });
    return Response.json(result);
  } catch (error) {
    // Respaldo si el cron lanza fuera de su propio catch.
    const message = error instanceof Error ? error.message : "failed";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
