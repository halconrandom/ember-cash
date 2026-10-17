/**
 * /login: entrar con Google o con un link mágico por correo.
 * Si ya hay sesión, redirige a `next` (o a la página principal).
 *
 * Con cacheComponents, la parte que lee cookies y searchParams va dentro de
 * <Suspense>; el encabezado se prerenderiza.
 */
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { ui } from "@/components/provisional/styles";
import { safeNextPath } from "@/lib/auth/redirect";
import { getCurrentUser } from "@/lib/auth/session";

import { LoginForm } from "./login-form";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Mensajes para los errores que llegan desde /auth/callback y /auth/confirm. */
const ERRORS: Record<string, string> = {
  callback: "No se pudo completar el inicio de sesión con Google. Intenta de nuevo.",
  link: "El link no es válido o ya venció. Pide uno nuevo.",
};

export default function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <div className={`${ui.card} w-full max-w-sm`}>
        <h1 className={ui.title}>Ember Cash</h1>
        <p className={`${ui.body2} mt-1`}>Inicia sesión para continuar.</p>
        <Suspense fallback={null}>
          <LoginContent searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

/** Parte dinámica: redirige si ya hay sesión y muestra el formulario. */
async function LoginContent({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);

  if (await getCurrentUser()) redirect(next);

  const errorKey = typeof params.error === "string" ? params.error : "";
  return <LoginForm next={next} initialError={ERRORS[errorKey] ?? null} />;
}
