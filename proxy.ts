/**
 * Proxy de Next.js 16 (el antiguo middleware). Refresca la sesión de Supabase
 * y protege las rutas privadas. La lógica está en lib/supabase/proxy.ts.
 */
import type { NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Corre en todas las rutas excepto archivos estáticos e imágenes.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
