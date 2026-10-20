/**
 * /onboarding: el wizard (bienvenida, moneda, cuenta, foco). Si la persona ya
 * terminó o omitió, vuelve al panel — salvo "Repetir la introducción"
 * (Ajustes > Ayuda, fase F3): ?replay=1 deja entrar igual, con los valores
 * actuales precargados, sin tocar onboarded_at ni duplicar cuentas o
 * elementos (wizard-actions.ts ya reutiliza lo que coincide en nombre y
 * moneda). El paso en el replay se lleva en la URL (?step=N), nunca en
 * profiles.onboarding_step: ese campo ya quedó en "terminado" de verdad.
 * La lectura del perfil va dentro de Suspense: con cacheComponents no puede
 * prerenderizarse.
 */
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Card } from "@/components/ui/card";
import { CenteredPage } from "@/components/ui/centered-page";
import { SkeletonList } from "@/components/ui/skeleton";
import { getCurrentProfile } from "@/lib/auth/session";
import { CURRENCY_CODES, type CurrencyCode } from "@/lib/db/types";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config";
import type { Rate } from "@/lib/money/convert";
import { listRates } from "@/lib/money/rates";
import { wizardStep, type WizardStep } from "@/lib/onboarding/logic";
import { getReplayAccountDefault, getReplayFocusDefault } from "@/lib/onboarding/replay";
import { getScope } from "@/lib/scope/server";

import { Wizard } from "./wizard";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function OnboardingPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <CenteredPage className="max-w-xl">
      <Suspense
        fallback={
          <Card>
            <SkeletonList rows={4} />
          </Card>
        }
      >
        <OnboardingContent searchParams={searchParams} />
      </Suspense>
    </CenteredPage>
  );
}

function replayStep(raw: string | string[] | undefined): WizardStep {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return n === 1 || n === 2 || n === 3 ? n : 0;
}

/** Paso guardado (o, en replay, el de la URL) y tasas ya conocidas. */
async function OnboardingContent({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const replay = params.replay === "1";
  const profile = await getCurrentProfile();
  if (profile.onboarded_at && !replay) redirect("/");

  let rates: Rate[] = [];
  try {
    rates = await listRates();
  } catch {
    rates = [];
  }
  const currency = (CURRENCY_CODES as readonly string[]).includes(profile.display_currency)
    ? (profile.display_currency as CurrencyCode)
    : "COP";

  if (!replay) {
    return <Wizard step={wizardStep(profile.onboarding_step)} currency={currency} rates={rates} />;
  }

  const locale = isLocale(profile.locale) ? profile.locale : DEFAULT_LOCALE;
  const scope = await getScope();
  const [accountDefault, focusDefault] = await Promise.all([
    getReplayAccountDefault(scope),
    getReplayFocusDefault(scope, locale),
  ]);
  return (
    <Wizard
      step={replayStep(params.step)}
      currency={currency}
      rates={rates}
      replay
      accountDefault={accountDefault}
      focusDefault={focusDefault}
    />
  );
}
