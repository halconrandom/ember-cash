/**
 * Enlaces al aviso y a los términos. El texto es el título de cada página,
 * no una frase nueva. Va al pie del login y de Ajustes.
 */
import { useTranslations } from "next-intl";

type Props = {
  /** Página actual, para marcar el enlace. */
  current?: "privacy" | "terms";
  className?: string;
};

/** Pie con el aviso de privacidad y los términos. */
export function LegalFooter({ current, className }: Props) {
  const privacy = useTranslations("legal.privacy");
  const terms = useTranslations("legal.terms");
  const link = "text-callout text-ember-text font-medium underline-offset-4 hover:underline";
  return (
    <footer className={className ?? "mt-8 flex flex-wrap gap-x-4 gap-y-2"}>
      <a
        href="/privacidad"
        className={link}
        aria-current={current === "privacy" ? "page" : undefined}
      >
        {privacy("title")}
      </a>
      <a href="/terminos" className={link} aria-current={current === "terms" ? "page" : undefined}>
        {terms("title")}
      </a>
    </footer>
  );
}
