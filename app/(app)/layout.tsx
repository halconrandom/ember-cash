/**
 * Layout del grupo protegido (app). Todo lo que está aquí requiere sesión:
 * proxy.ts ya redirige a /login, y requireUser() lo vuelve a comprobar en el
 * servidor. También sincroniza tema e idioma con el perfil.
 *
 * La comprobación lee cookies, así que va dentro de <Suspense> (cacheComponents).
 */
import { Suspense } from "react";

import { LocaleSync } from "@/components/i18n/locale-sync";
import { ThemeSync } from "@/components/theme/theme-provider";
import { getCurrentProfile } from "@/lib/auth/session";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config";
import { isThemePreference } from "@/lib/theme/constants";

export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <Suspense fallback={null}>
      <AuthGate>{children}</AuthGate>
    </Suspense>
  );
}

/** Verifica la sesión (getCurrentProfile llama a requireUser) y sincroniza preferencias. */
async function AuthGate({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  return (
    <>
      <ThemeSync theme={isThemePreference(profile.theme) ? profile.theme : "system"} />
      <LocaleSync locale={isLocale(profile.locale) ? profile.locale : DEFAULT_LOCALE} />
      {children}
    </>
  );
}
