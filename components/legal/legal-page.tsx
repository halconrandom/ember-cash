/**
 * Marco de /privacidad y /terminos: marca, documento y pie.
 * Pública: no pide sesión. El ancho cabe en el teléfono.
 */
import { useTranslations } from "next-intl";

import { LegalDocument } from "./legal-document";
import { LegalFooter } from "./legal-footer";

type Props = {
  section: "privacy" | "terms";
  contactEmail: string;
};

/** Página legal completa. */
export function LegalPage({ section, contactEmail }: Props) {
  const t = useTranslations("common");
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 py-12 sm:py-16">
      <a href="/login" className="text-brand text-ink mb-8 inline-flex">
        {t("appName")}
      </a>
      <LegalDocument section={section} contactEmail={contactEmail} />
      <LegalFooter current={section} />
    </main>
  );
}
