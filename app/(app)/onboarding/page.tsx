/**
 * /onboarding: el wizard (bienvenida, moneda, cuenta, foco). Si la persona ya
 * terminó o omitió, vuelve al panel. La lectura del perfil va dentro de
 * Suspense: con cacheComponents no puede prerenderizarse.
 */
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Card } from "@/components/ui/card";
import { CenteredPage } from "@/components/ui/centered-page";
import { SkeletonList } from "@/components/ui/skeleton";
import { getCurrentProfile } from "@/lib/auth/session";
import { CURRENCY_CODES, type CurrencyCode } from "@/lib/db/types";
import type { Rate } from "@/lib/money/convert";
import { listRates } from "@/lib/money/rates";
import { wizardStep } from "@/lib/onboarding/logic";

import { Wizard } from "./wizard";

export default function OnboardingPage() {
  return (
    <CenteredPage className="max-w-xl">
      <Suspense
        fallback={
          <Card>
            <SkeletonList rows={4} />
          </Card>
        }
      >
        <OnboardingContent />
      </Suspense>
    </CenteredPage>
  );
}

/** Paso guardado y tasas ya conocidas. No pide una tasa nueva en este flujo. */
async function OnboardingContent() {
  const profile = await getCurrentProfile();
  if (profile.onboarded_at) redirect("/");
  let rates: Rate[] = [];
  try {
    rates = await listRates();
  } catch {
    rates = [];
  }
  const currency = (CURRENCY_CODES as readonly string[]).includes(profile.display_currency)
    ? (profile.display_currency as CurrencyCode)
    : "COP";
  return <Wizard step={wizardStep(profile.onboarding_step)} currency={currency} rates={rates} />;
}
