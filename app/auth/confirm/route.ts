/**
 * GET /auth/confirm
 * Destino del link mágico por correo. La plantilla de Supabase envía
 * `token_hash` y `type`; se verifican aquí y se crea la sesión. Funciona
 * aunque el link se abra en otro navegador o dispositivo.
 */
import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { safeNextPath } from "@/lib/auth/redirect";
import { createClient } from "@/lib/supabase/server";

/** Tipos de OTP por correo que acepta esta ruta. */
const EMAIL_OTP_TYPES: readonly EmailOtpType[] = ["email", "signup", "magiclink"];

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNextPath(searchParams.get("next"));

  if (tokenHash && type && EMAIL_OTP_TYPES.includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }

  return NextResponse.redirect(new URL("/login?error=link", origin));
}
