/**
 * POST /auth/signout
 * Cierra la sesión y vuelve a /login. Es POST para que un enlace o un
 * prefetch no puedan cerrar la sesión por accidente.
 */
import { NextResponse, type NextRequest } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // 303 para que el navegador haga GET a /login después del POST.
  return NextResponse.redirect(new URL("/login", request.nextUrl.origin), { status: 303 });
}
