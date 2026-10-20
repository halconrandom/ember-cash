/**
 * Layout del grupo protegido (app). Todo lo que está aquí requiere sesión:
 * proxy.ts ya redirige a /login, y requireUser() lo vuelve a comprobar en el
 * servidor. Sin el consentimiento de la versión vigente no se pintan las
 * páginas: queda la pantalla de aceptación. También sincroniza tema e idioma
 * con el perfil y entrega las tasas conocidas y la moneda de visualización
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
import { CURRENCY_CODES, type CurrencyCode } from "@/lib/db/types";
import { DEFAULT_LOCALE, isLocale } from "@/lib/i18n/config";
import { hasCurrentConsent } from "@/lib/legal/consent";
import { listOwnCurrentConsents } from "@/lib/legal/queries";
import { listRates } from "@/lib/money/rates";
import { isThemePreference } from "@/lib/theme/constants";

export default function AppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <Suspense fallback={null}>
      <AuthGate>{children}</AuthGate>
    </Suspense>
  );
}

/** Verifica la sesión (getCurrentProfile llama a requireUser), el consentimiento, las preferencias y las tasas. */
async function AuthGate({ children }: { children: React.ReactNode }) {
  const [profile, rates, consents] = await Promise.all([
    getCurrentProfile(),
    // Si las tasas no se pueden leer, la app sigue: el chip muestra el error.
    listRates().catch(() => []),
    listOwnCurrentConsents(),
  ]);
  const displayCurrency: CurrencyCode = (
    CURRENCY_CODES as readonly string[]
  ).includes(profile.display_currency)
    ? (profile.display_currency as CurrencyCode)
    : "COP";
  return (
    <RateProvider initialRates={rates} initialDisplayCurrency={displayCurrency}>
      <ThemeSync theme={isThemePreference(profile.theme) ? profile.theme : "system"} />
      <LocaleSync locale={isLocale(profile.locale) ? profile.locale : DEFAULT_LOCALE} />
      <ConsentBoundary allowed={hasCurrentConsent(consents)} blocked={<ConsentScreen />}>
        {children}
      </ConsentBoundary>
    </RateProvider>
  );
}
