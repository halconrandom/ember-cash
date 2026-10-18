/**
 * /login: entrar con Google o con un link mágico por correo.
 * Si ya hay sesión, redirige a `next` (o a la página principal).
 *
 * Con cacheComponents, la parte que lee cookies y searchParams va dentro de
 * <Suspense>; el encabezado se prerenderiza.
 */
import { redirect } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense } from "react";

import { LegalFooter } from "@/components/legal/legal-footer";
import { Card } from "@/components/ui/card";
import { CenteredPage } from "@/components/ui/centered-page";
import { safeNextPath } from "@/lib/auth/redirect";
import { getCurrentUser } from "@/lib/auth/session";

import { LoginForm } from "./login-form";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Errores que llegan desde /auth/callback y /auth/confirm (claves de login.errors). */
const ERROR_KEYS = ["callback", "link"] as const;
type LoginErrorKey = (typeof ERROR_KEYS)[number];

export default function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const t = useTranslations("login");
  return (
    <CenteredPage className="max-w-sm">
      <Card>
        <h1 className="text-title2 text-ink">{t("title")}</h1>
        <p className="text-body text-ink-2 mt-1">{t("subtitle")}</p>
        <Suspense fallback={null}>
          <LoginContent searchParams={searchParams} />
        </Suspense>
      </Card>
      <LegalFooter />
    </CenteredPage>
  );
}

/** Parte dinámica: redirige si ya hay sesión y muestra el formulario. */
async function LoginContent({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const next = safeNextPath(typeof params.next === "string" ? params.next : null);

  if (await getCurrentUser()) redirect(next);

  const error = typeof params.error === "string" ? params.error : "";
  const initialError = (ERROR_KEYS as readonly string[]).includes(error)
    ? (error as LoginErrorKey)
    : null;
  return <LoginForm next={next} initialError={initialError} />;
}
