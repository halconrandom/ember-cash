/**
 * Layout del grupo protegido (app). Todo lo que está aquí requiere sesión:
 * proxy.ts ya redirige a /login, y requireUser() lo vuelve a comprobar en el
 * servidor. Sin el consentimiento de la versión vigente no se pintan las
 * páginas: queda la pantalla de aceptación. También sincroniza tema e idioma
 * con el perfil y entrega la tasa más reciente y la moneda de visualización
 * a <RateProvider>.
 *
 * La comprobación lee cookies, así que va dentro de <Suspense> (cacheComponents).
 */
import { Suspense } from "react";

import { LocaleSync } from "@/components/i18n/locale-sync";
import { RateProvider } from "@/components/money/rate-provider";
import { ThemeSync } from "@/components/theme/theme-provider";
import { ConsentBoundary } from "@/components/legal/consent-boundary";
import { ConsentScreen } from "@/components/legal/consent-screen";
import { getCurrentProfile } from "@/lib/auth/session";
import type { CurrencyCode } from "@/lib/db/types";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config";
import { hasCurrentConsent } from "@/lib/legal/consent";
import { listOwnCurrentConsents } from "@/lib/legal/queries";
import { getLatestRate } from "@/lib/money/rates";
import { isThemePreference } from "@/lib/theme/constants";

export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <Suspense fallback={null}>
      <AuthGate>{children}</AuthGate>
    </Suspense>
  );
}

/** Verifica la sesión (getCurrentProfile llama a requireUser), el consentimiento, las preferencias y la tasa. */
async function AuthGate({ children }: { children: React.ReactNode }) {
  const [profile, rate, consents] = await Promise.all([
    getCurrentProfile(),
    // Si la tasa no se puede leer, la app sigue: el chip muestra el error.
    getLatestRate().catch(() => null),
    listOwnCurrentConsents(),
  ]);
  const displayCurrency: CurrencyCode = profile.display_currency === "USD" ? "USD" : "COP";
  return (
    <RateProvider initialRate={rate} initialDisplayCurrency={displayCurrency}>
      <ThemeSync theme={isThemePreference(profile.theme) ? profile.theme : "system"} />
      <LocaleSync locale={isLocale(profile.locale) ? profile.locale : DEFAULT_LOCALE} />
      <ConsentBoundary allowed={hasCurrentConsent(consents)} blocked={<ConsentScreen />}>
        {children}
      </ConsentBoundary>
    </RateProvider>
  );
}
