/**
 * Dashboard (vacío en esta fase). Si el usuario no terminó el onboarding, lo
 * manda a /onboarding.
 */
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { getCurrentProfile } from "@/lib/auth/session";

export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingGuard />
    </Suspense>
  );
}

async function OnboardingGuard() {
  const profile = await getCurrentProfile();
  if (!profile.onboarded_at) redirect("/onboarding");
  return null;
}
