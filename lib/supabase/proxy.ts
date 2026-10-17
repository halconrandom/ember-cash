/**
 * Lógica de sesión para proxy.ts (antes "middleware" en Next.js < 16).
 *
 * En cada petición:
 * 1. Refresca la sesión de Supabase si el access token venció y reescribe
 *    las cookies en la respuesta.
 * 2. Si no hay sesión y la ruta es privada, redirige a /login conservando la
 *    ruta original en `?next=` para volver después del login.
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getPublicEnv } from "@/lib/env";

import type { Database } from "./database.types";

/** Rutas que no requieren sesión. Las APIs manejan su propia autenticación. */
export function isPublicPath(pathname: string): boolean {
  return pathname === "/login" || pathname.startsWith("/auth/") || pathname.startsWith("/api/");
}

export async function updateSession(request: NextRequest) {
  const env = getPublicEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          // Las cookies nuevas se copian a la petición (para que las lean los
          // Server Components de esta misma petición) y a la respuesta.
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          // Cabeceras anti-caché: una respuesta con cookies de sesión nunca
          // debe guardarse en un CDN.
          for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
        },
      },
    },
  );

  // getClaims() valida el JWT y refresca la sesión si hace falta. No debe
  // haber código entre createServerClient y esta llamada.
  const { data } = await supabase.auth.getClaims();
  const isSignedIn = Boolean(data?.claims);

  const { pathname, search } = request.nextUrl;
  if (!isSignedIn && !isPublicPath(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    if (pathname !== "/") loginUrl.searchParams.set("next", pathname + search);
    const redirect = NextResponse.redirect(loginUrl);
    // Conserva las cookies que Supabase haya limpiado o renovado.
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }

  return response;
}
