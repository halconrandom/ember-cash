/**
 * Aviso de privacidad o términos. Solo pinta las claves de legal.privacy o
 * legal.terms, en su orden, más legal.draftNotice y legal.versionLine.
 * {version}, {date} y {contactEmail} llegan como valores, no escritos a mano.
 */
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { useFormat } from "@/lib/i18n/use-format";
import { legalBlocks } from "@/lib/legal/document";
import { LEGAL_VERSION, LEGAL_VERSION_DATE } from "@/lib/legal/version";
import es from "@/messages/es.json";

type Section = "privacy" | "terms";

const KEYS: Record<Section, string[]> = {
  privacy: Object.keys(es.legal.privacy),
  terms: Object.keys(es.legal.terms),
};

type Props = {
  section: Section;
  /** Correo público (NEXT_PUBLIC_CONTACT_EMAIL). */
  contactEmail: string;
};

/** Deja el correo como enlace mailto sin cambiar la frase. */
function withEmail(text: string, email: string): ReactNode {
  const at = text.indexOf(email);
  if (at < 0) return text;
  return (
    <>
      {text.slice(0, at)}
      <a
        href={`mailto:${email}`}
        className="text-ember-text font-medium underline-offset-4 hover:underline"
      >
        {email}
      </a>
      {text.slice(at + email.length)}
    </>
  );
}

/** Página legal de una sección, en el idioma de la cookie. */
export function LegalDocument({ section, contactEmail }: Props) {
  const t = useTranslations(`legal.${section}`);
  const legal = useTranslations("legal");
  const format = useFormat();
  const blocks = legalBlocks(KEYS[section]).filter((block) => block.kind !== "title");

  return (
    <article className="max-w-2xl">
      <p className="border-border bg-surface2 text-callout text-ink rounded-card border px-4 py-3">
        {legal("draftNotice")}
      </p>
      <header className="mt-6 space-y-2">
        <h1 className="text-title1 text-ink">{t("title")}</h1>
        <p className="text-footnote text-ink-2">
          {legal("versionLine", {
            version: LEGAL_VERSION,
            date: format.date(LEGAL_VERSION_DATE, "long"),
          })}
        </p>
      </header>
      <div className="mt-6 space-y-3">
        {blocks.map((block) => {
          if (block.kind === "heading") {
            return (
              <h2 key={block.key} className="text-headline text-ink pt-3">
                {t(block.key)}
              </h2>
            );
          }
          if (block.kind === "list") {
            return (
              <ul
                key={block.keys.join("-")}
                className="text-body text-ink list-disc space-y-1 pl-5"
              >
                {block.keys.map((key) => (
                  <li key={key}>{t(key)}</li>
                ))}
              </ul>
            );
          }
          const text = block.key === "contactBody" ? t(block.key, { contactEmail }) : t(block.key);
          return (
            <p key={block.key} className="text-body text-ink">
              {block.key === "contactBody" ? withEmail(text, contactEmail) : text}
            </p>
          );
        })}
      </div>
    </article>
  );
}
