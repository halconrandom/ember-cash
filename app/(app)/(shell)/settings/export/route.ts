/**
 * GET /settings/export
 *
 * ZIP con un CSV por tabla de lo que esta sesión puede ver. Exige sesión
 * aquí, además del proxy: la ruta no está bajo /api (esa zona no pide
 * sesión). Responde el archivo y no guarda caché.
 */
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth/session";
import { getPublicEnv } from "@/lib/env";
import { buildBackupZip } from "@/lib/export/backup";
import { logServerError } from "@/lib/log/server";
import { consumeRateLimit, rateLimitText } from "@/lib/security/rate-limit";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  await requireUser();
  // 3 por hora. 429 con Retry-After: el enlace es una descarga, no una acción.
  const limit = await consumeRateLimit("export");
  if (!limit.allowed) {
    return new Response(await rateLimitText("export"), {
      status: 429,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Retry-After": String(limit.retryAfter),
        "Cache-Control": "private, no-store",
      },
    });
  }
  const supabase = await createClient();
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) redirect("/login");

  const env = getPublicEnv();
  try {
    const bytes = await buildBackupZip({
      supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
      anonKey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      accessToken,
    });
    const filename = `ember-cash-${new Date().toISOString().slice(0, 10)}.zip`;
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    logServerError("export", error);
    return Response.json({ ok: false, error: "export_failed" }, { status: 500 });
  }
}
