/**
 * Pantalla que reemplaza a la app mientras no hay consentimiento vigente.
 * El nombre es el de la marca; el texto legal vive en el formulario.
 */
import { useTranslations } from "next-intl";

import { Card } from "@/components/ui/card";
import { CenteredPage } from "@/components/ui/centered-page";

import { ConsentForm } from "./consent-form";

/** Bloquea el uso de la app hasta aceptar la versión vigente. */
export function ConsentScreen() {
  const t = useTranslations("common");
  return (
    <CenteredPage className="max-w-sm">
      <Card>
        <h1 className="text-title2 text-ink">{t("appName")}</h1>
        <ConsentForm />
      </Card>
    </CenteredPage>
  );
}
