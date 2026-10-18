/**
 * GET /api/cron/rates
 * Lo llama el cron diario de Vercel (vercel.json) con el encabezado
 * `Authorization: Bearer <CRON_SECRET>`. Trae la TRM (o el respaldo) y la
 * guarda en exchange_rates. Si las dos fuentes fallan responde 502 y no
 * escribe nada: se conserva la última tasa.
 */
import { timingSafeEqual } from "node:crypto";

import { getServerEnv } from "@/lib/env-server";
import { logServerError } from "@/lib/log/server";
import { fetchAndStoreRate } from "@/lib/money/rates";

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

  const result = await fetchAndStoreRate();
  if (!result.ok) {
    // El detalle de las fuentes queda en el log. La respuesta es una clave.
    logServerError("cron.rates", new Error(result.errors.join("; ")));
    return Response.json({ ok: false, error: "all_sources_failed" }, { status: 502 });
  }
  return Response.json({ ok: true, rate: result.rate });
}
