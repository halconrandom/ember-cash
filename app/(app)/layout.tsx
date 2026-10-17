/**
 * Layout del grupo protegido (app). Todo lo que está aquí requiere sesión:
 * proxy.ts ya redirige a /login, y requireUser() lo vuelve a comprobar en el
 * servidor. También sincroniza el tema con profiles.theme.
 *
 * La comprobación lee cookies, así que va dentro de <Suspense> (cacheComponents).
 */
import { Suspense } from "react";

import { ThemeSync } from "@/components/theme/theme-provider";
import { getCurrentProfile } from "@/lib/auth/session";
import { isThemePreference } from "@/lib/theme/constants";

export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <Suspense fallback={null}>
      <AuthGate>{children}</AuthGate>
    </Suspense>
  );
}

/** Verifica la sesión (getCurrentProfile llama a requireUser) y sincroniza el tema. */
async function AuthGate({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  return (
    <>
      <ThemeSync theme={isThemePreference(profile.theme) ? profile.theme : "system"} />
      {children}
    </>
  );
}
