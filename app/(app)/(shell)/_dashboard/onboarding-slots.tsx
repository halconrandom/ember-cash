/**
 * Pista del paso 4, Primeros pasos y el aviso de Omitir. Cada uno aísla su
 * lectura: si falla, el resto del panel sigue.
 */
import { getTranslations } from "next-intl/server";

import { DoneHint } from "@/components/onboarding/done-hint";
import { FirstStepsCard } from "@/components/onboarding/first-steps-card";
import { SkippedToast } from "@/components/onboarding/skipped-toast";
import { getCurrentProfile } from "@/lib/auth/session";
import { loadFirstStepFlags } from "@/lib/onboarding/queries";

import { dismissDashboardHint, dismissFirstSteps } from "@/app/(app)/onboarding/wizard-actions";

import { CardError } from "./card-error";
import { FAILED, safe, type SearchParams } from "./slots";

function skippedFlag(value: string | string[] | undefined): boolean {
  if (Array.isArray(value)) return value.includes("1");
  return value === "1";
}

/** Toast de "omitir". Solo se monta con ?skipped=1. */
export async function SkippedSlot({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  if (!skippedFlag(params.skipped)) return null;
  return <SkippedToast />;
}

/** "Listo. Este es tu panel." Hasta que toca Entendido, o si omitió. */
export async function DoneHintSlot() {
  const data = await safe(async () => {
    const profile = await getCurrentProfile();
    if (!profile.onboarded_at || profile.onboarding_step !== 4) return null;
    if (profile.dashboard_hint_dismissed_at) return null;
    return profile.display_currency;
  });
  if (data === FAILED) {
    const t = await getTranslations("onboarding.done");
    return <CardError title={t("title")} />;
  }
  if (!data) return null;
  return <DoneHint currency={data} onDismiss={dismissDashboardHint} />;
}

/** Pendientes del panel. No se muestra si la persona la ocultó. */
export async function FirstStepsSlot() {
  const data = await safe(async () => {
    const profile = await getCurrentProfile();
    if (!profile.onboarded_at || profile.first_steps_dismissed_at) return null;
    return loadFirstStepFlags();
  });
  if (data === FAILED) {
    const t = await getTranslations("firstSteps");
    return <CardError title={t("title")} />;
  }
  if (!data) return null;
  return <FirstStepsCard flags={data} onDismiss={dismissFirstSteps} />;
}
