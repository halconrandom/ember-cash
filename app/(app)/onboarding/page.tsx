/**
 * /onboarding: se muestra después del primer login. Si el usuario ya lo
 * terminó, vuelve a la página principal.
 */
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Card } from "@/components/ui/card";
import { CenteredPage } from "@/components/ui/centered-page";
import { SkeletonList } from "@/components/ui/skeleton";
import { getCurrentProfile } from "@/lib/auth/session";

import { OnboardingChoices } from "./onboarding-choices";

export default function OnboardingPage() {
  return (
    <CenteredPage className="max-w-xl space-y-6">
      <div>
        <h1 className="text-title1 text-ink">Bienvenido a Ember Cash</h1>
        <p className="text-body text-ink-2 mt-1">¿Cómo vas a usar la app?</p>
      </div>
      <Suspense
        fallback={
          <Card>
            <SkeletonList rows={3} />
          </Card>
        }
      >
        <OnboardingContent />
      </Suspense>
    </CenteredPage>
  );
}

/** Redirige si el onboarding ya está hecho; si no, muestra las opciones. */
async function OnboardingContent() {
  const profile = await getCurrentProfile();
  if (profile.onboarded_at) redirect("/");
  return <OnboardingChoices />;
}
