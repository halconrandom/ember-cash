/**
 * GET /.well-known/security.txt
 * Público. Contact es el mismo correo que el aviso de privacidad.
 * No lee la base ni pide sesión.
 */
import { getPublicEnv } from "@/lib/env";
import { securityTxt } from "@/lib/legal/security-txt";

export function GET(request: Request) {
  const email = getPublicEnv().NEXT_PUBLIC_CONTACT_EMAIL;
  const canonical = `${new URL(request.url).origin}/.well-known/security.txt`;
  return new Response(securityTxt({ contactEmail: email, canonical }), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=86400",
    },
  });
}
