"use client";

/**
 * Botón de ayuda (44x44, spec de onboarding/ayuda contextual): un "?". Se
 * repite dos veces en <Topbar> (escritorio junto al selector de moneda,
 * móvil en la fila del subtítulo) con la misma función `onOpen`; cada una
 * se oculta con clases según el ancho. El punto azul marca que esta página
 * tiene ayuda nueva (primera visita); desaparece al abrir el panel.
 */
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

type Props = {
  onOpen: () => void;
  showDot: boolean;
  className?: string;
};

export function HelpTriggerButton({ onOpen, showDot, className }: Props) {
  const t = useTranslations("help.common");
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t("button")}
      className={cn(
        "text-ink-2 hover:bg-surface2 hover:text-ink relative grid size-11 shrink-0 place-items-center rounded-full text-headline font-semibold transition-colors duration-100",
        className,
      )}
    >
      ?
      {showDot && (
        <>
          <span
            aria-hidden
            className="bg-info absolute top-1.5 right-1.5 size-2.5 rounded-full"
          />
          <span className="sr-only">{t("newDot")}</span>
        </>
      )}
    </button>
  );
}
