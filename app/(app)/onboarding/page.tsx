/**
 * /onboarding: se muestra después del primer login. Si el usuario ya lo
 * terminó, vuelve a la página principal.
 *
 * El encabezado es estático; la comprobación del perfil va dentro de
 * <Suspense> (cacheComponents).
 */
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { LoadingCard } from "@/components/provisional/loading-card";
import { ui } from "@/components/provisional/styles";
import { getCurrentProfile } from "@/lib/auth/session";

import { OnboardingChoices } from "./onboarding-choices";

export default function OnboardingPage() {
  return (
    <div className="w-full max-w-xl space-y-6">
      <div>
        <h1 className={ui.title}>Bienvenido a Ember Cash</h1>
        <p className={`${ui.body2} mt-1`}>¿Cómo vas a usar la app?</p>
      </div>
      <Suspense fallback={<LoadingCard />}>
        <OnboardingContent />
      </Suspense>
    </div>
  );
}

/** Redirige si el onboarding ya está hecho; si no, muestra las opciones. */
async function OnboardingContent() {
  const profile = await getCurrentProfile();
  if (profile.onboarded_at) redirect("/");
  return <OnboardingChoices />;
}
