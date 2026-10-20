"use client";

/**
 * Pista del paso 4, encima del panel: cómo leer el total y dónde estará la
 * ayuda. "Entendido" no es el botón primario: la barra ya tiene "Agregar".
 */
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import { WIZARD_TOTAL } from "@/lib/onboarding/logic";

export function DoneHint({
  currency,
  onDismiss,
}: {
  currency: string;
  onDismiss: () => Promise<void>;
}) {
  const t = useTranslations("onboarding");
  return (
    <Card className="space-y-3">
      <p className="text-callout text-ink-3">
        {t("common.progress", { step: WIZARD_TOTAL, total: WIZARD_TOTAL })}
      </p>
      <h2 className="text-title2 text-ink">{t("done.title")}</h2>
      <p className="text-body text-ink-2">{t("done.body", { currency })}</p>
      <p className="text-body text-ink-2">{t("done.helpHint")}</p>
      <form action={onDismiss}>
        <Button type="submit" variant="secondary">
          {t("done.cta")}
        </Button>
      </form>
    </Card>
  );
}
