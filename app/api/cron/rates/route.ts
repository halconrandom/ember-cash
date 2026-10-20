/**
 * GET /api/cron/rates
 * Lo llama el cron diario de Vercel (vercel.json) con el encabezado
 * `Authorization: Bearer <CRON_SECRET>`. Trae y guarda los tres pares de la
 * fase E1 (USD/COP, EUR/USD y EUR/COP derivada). Si los tres fallan responde
 * 502 y no escribe nada: se conserva la última tasa de cada par.
 */
import { timingSafeEqual } from "node:crypto";

import { getServerEnv } from "@/lib/env-server";
import { logServerError } from "@/lib/log/server";
import { fetchAndStoreRates } from "@/lib/money/rates";

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

  const result = await fetchAndStoreRates();
  const failed = Object.entries(result).filter(([, r]) => !r.ok) as [
    string,
    { ok: false; errors: string[] },
  ][];
  for (const [pair, r] of failed) {
    // El detalle de las fuentes queda en el log. La respuesta es una clave.
    logServerError(`cron.rates.${pair}`, new Error(r.errors.join("; ")));
  }
  if (failed.length === Object.keys(result).length) {
    return Response.json({ ok: false, error: "all_sources_failed" }, { status: 502 });
  }
  return Response.json({ ok: true, rates: result });
}
