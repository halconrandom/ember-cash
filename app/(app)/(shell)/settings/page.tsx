/**
 * Ajustes: apariencia (tema e idioma, guardados en el perfil), cuenta y
 * créditos. Los créditos incluyen la atribución que exige la licencia
 * gratuita de Flaticon (DESIGN_SPEC §6).
 */
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import { Card, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/session";

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
        <CardTitle>{t("account")}</CardTitle>
        <Suspense fallback={<p className="h-5" />}>
          <AccountEmail />
        </Suspense>
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="border-border bg-surface text-body text-ink hover:bg-surface2 inline-flex h-10 items-center rounded-full border px-6 font-semibold transition-colors duration-100"
          >
            {t("signOut")}
          </button>
        </form>
      </Card>

      <Card className="space-y-2">
        <CardTitle>{t("about")}</CardTitle>
        <p className="text-body text-ink-2">
          {t.rich("attribution", {
            link: (chunks) => (
              <a
                href="https://www.flaticon.com/uicons"
                target="_blank"
                rel="noreferrer"
                className="text-ember-text font-medium underline-offset-4 hover:underline"
              >
                {chunks}
              </a>
            ),
          })}
        </p>
      </Card>
    </div>
  );
}

async function AccountEmail() {
  const user = await requireUser();
  return <p className="text-body text-ink-2">{user.email}</p>;
}
