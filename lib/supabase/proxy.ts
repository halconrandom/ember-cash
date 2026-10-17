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
import { contentSecurityPolicy } from "@/lib/security/headers";

import type { Database } from "@/lib/db/types";

/**
 * Rutas que no requieren sesión. Las APIs manejan su propia autenticación.
 * /dev/* (design system) solo existe fuera de producción.
 */
export function isPublicPath(
  pathname: string,
  env: string | undefined = process.env.NODE_ENV,
): boolean {
  return (
    pathname === "/login" ||
    pathname === "/offline" ||
    pathname === "/sw.js" ||
    pathname === "/offline.html" ||
    pathname === "/manifest.webmanifest" ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api/") ||
    (env !== "production" && pathname.startsWith("/dev/"))
  );
}

export async function updateSession(request: NextRequest) {
  const env = getPublicEnv();
  // Nonce por petición. Next lo copia a sus scripts si la CSP va en la request.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy({
    nonce,
    isDev: process.env.NODE_ENV !== "production",
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
  });

  // Next solo reenvía headers si se pasan en `request.headers` de
  // NextResponse.next (ver la guía de CSP). Se clonan aquí, no se muta el
  // request: al refrescar cookies hay que reconstruir el header que ve el render.
  const continueWith = () => {
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("Content-Security-Policy", csp);
    requestHeaders.set("x-nonce", nonce);
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set("Content-Security-Policy", csp);
    return res;
  };

  let response = continueWith();

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
          response = continueWith();
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
    redirect.headers.set("Content-Security-Policy", csp);
    // Conserva las cookies que Supabase haya limpiado o renovado.
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }

  return response;
}
