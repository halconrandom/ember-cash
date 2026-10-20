"use client";

/**
 * Botón de ayuda (44x44, spec de onboarding/ayuda contextual): ícono
 * CircleHelp fantasma (sin fondo ni borde en reposo, área táctil de 44x44).
 * Se repite dos veces en <Topbar> (escritorio junto al selector de moneda,
 * móvil en la fila del subtítulo) con la misma función `onOpen`; cada una
 * se oculta con clases según el ancho. El punto azul marca que esta página
 * tiene ayuda nueva (primera visita); desaparece al abrir el panel.
 */
import { useTranslations } from "next-intl";

import { Icon } from "@/components/ui/icon";
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
      aria-label={t("buttonTooltip")}
      title={t("buttonTooltip")}
      className={cn(
        "text-ink-2 hover:bg-seg-track hover:text-ink press-scale relative inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-colors duration-100",
        className,
      )}
    >
      <Icon name="help" size={20} />
      {showDot && (
        <>
          <span aria-hidden className="bg-info absolute top-2 right-2 size-2 rounded-full" />
          <span className="sr-only">{t("newDot")}</span>
        </>
      )}
    </button>
  );
}
