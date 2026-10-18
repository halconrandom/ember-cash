/**
 * Ajustes: apariencia (tema e idioma, guardados en el perfil), cuenta,
 * respaldo y créditos. Al final, el aviso de privacidad y los términos.
 *
 * Acerca de lleva la atribución de la licencia gratuita de Flaticon
 * (DESIGN_SPEC §6): "designed by {autor} from Flaticon", con enlace.
 * Uicons es de Flaticon, así que el autor y el sitio son Flaticon.
 */
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { LegalFooter } from "@/components/legal/legal-footer";
import { Card, CardTitle } from "@/components/ui/card";
import { SkeletonList } from "@/components/ui/skeleton";
import { getAccounts } from "@/lib/accounts/queries";
import { getCurrentProfile, requireUser } from "@/lib/auth/session";
import { getScope } from "@/lib/scope/server";

import { AccountsManager } from "./accounts-manager";
import { DeleteAccountSection } from "./delete-account-section";

import { LocaleSetting } from "./locale-setting";
import { ThemeSetting } from "./theme-setting";

export default async function SettingsPage() {
  const t = await getTranslations("settings");
  return (
    <div className="max-w-xl space-y-6">
      <Card className="space-y-5">
        <CardTitle>{t("appearance")}</CardTitle>
        <div className="space-y-2">
          <p className="text-callout text-ink-2 font-semibold">{t("theme")}</p>
          <ThemeSetting />
        </div>
        <div className="space-y-2">
          <p className="text-callout text-ink-2 font-semibold">{t("language")}</p>
          <LocaleSetting />
        </div>
      </Card>

      <Card className="space-y-4">
        <CardTitle>{(await getTranslations("accounts"))("title")}</CardTitle>
        <Suspense fallback={<SkeletonList rows={2} />}>
          <AccountsSection />
        </Suspense>
      </Card>

      <Card className="space-y-4">
        <CardTitle>{t("account")}</CardTitle>
        <Suspense fallback={<p className="h-5" />}>
          <AccountEmail />
        </Suspense>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="border-border bg-surface text-body text-ink hover:bg-surface2 inline-flex min-h-11 items-center rounded-full border px-6 font-semibold transition-colors duration-100"
          >
            {t("signOut")}
          </button>
        </form>
      </Card>

      <Card className="space-y-3">
        <CardTitle>{t("backup")}</CardTitle>
        <p className="text-body text-ink-2">{t("backupBody")}</p>
        <p className="text-body text-ink-2">{t("backupRestore")}</p>
        {/* <a>, no Link: un prefetch no debe disparar la descarga. */}
        <a
          href="/settings/export"
          className="border-border bg-surface text-body text-ink hover:bg-surface2 inline-flex min-h-11 items-center rounded-full border px-6 font-semibold transition-colors duration-100"
        >
          {t("exportCsv")}
        </a>
      </Card>

      <Suspense fallback={<SkeletonList rows={2} />}>
        <DeleteAccountSectionAsync />
      </Suspense>

      <Card className="space-y-2">
        <CardTitle>{t("about")}</CardTitle>
        <p className="text-body text-ink-2">
          {t.rich("attribution", {
            author: (chunks) => (
              <a
                href="https://www.flaticon.com/uicons"
                target="_blank"
                rel="noopener noreferrer"
                className="text-ember-text font-medium underline-offset-4 hover:underline"
              >
                {chunks}
              </a>
            ),
            site: (chunks) => (
              <a
                href="https://www.flaticon.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-ember-text font-medium underline-offset-4 hover:underline"
              >
                {chunks}
              </a>
            ),
          })}
        </p>
      </Card>

      <LegalFooter className="flex flex-wrap gap-x-4 gap-y-2" />
    </div>
  );
}

async function AccountEmail() {
  const user = await requireUser();
  return <p className="text-body text-ink-2">{user.email}</p>;
}

/** "Privacidad y datos": el botón de exportar reutiliza la ruta existente,
 * con el texto legal aprobado (account.exportButton). */
async function DeleteAccountSectionAsync() {
  const accountT = await getTranslations("account");
  return <DeleteAccountSection exportLabel={accountT("exportButton")} />;
}

/** Cuentas del scope actual (incluidas las archivadas). */
async function AccountsSection() {
  const [scope, profile] = await Promise.all([getScope(), getCurrentProfile()]);
  const accounts = await getAccounts(scope, { includeArchived: true });
  return (
    <AccountsManager
      accounts={accounts}
      defaultCurrency={profile.display_currency === "USD" ? "USD" : "COP"}
    />
  );
}
