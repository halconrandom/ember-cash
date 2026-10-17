"use client";

/**
 * Filtro por moneda ORIGINAL de los movimientos (spec §4.3): chip de selección
 * "Moneda: Todas / COP / USD" para la fila de filtros. No cambia la moneda de
 * visualización. Usa un <select> nativo con aspecto de chip (accesible con
 * teclado y lector de pantalla sin trabajo extra).
 */
import { useTranslations } from "next-intl";
import { useId } from "react";

import { Icon } from "@/components/ui/icon";
import type { CurrencyCode } from "@/lib/db/types";
import { cn } from "@/lib/utils";

export type CurrencyFilterValue = "all" | CurrencyCode;

type Props = {
  value: CurrencyFilterValue;
  onChange: (value: CurrencyFilterValue) => void;
  className?: string;
};

export function CurrencyFilter({ value, onChange, className }: Props) {
  const t = useTranslations("currency");
  const id = useId();
  const active = value !== "all";

  return (
    <div
      className={cn(
        "text-callout relative inline-flex h-9 items-center gap-1 rounded-full border pr-8 pl-3.5 font-medium transition-colors duration-100",
        active
          ? "bg-ember-50 text-ember-text border-transparent"
          : "border-border bg-surface text-ink hover:bg-surface2",
        className,
      )}
    >
      <label htmlFor={id} className="text-ink-2">
        {t("filterLabel")}:
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as CurrencyFilterValue)}
        className="cursor-pointer appearance-none bg-transparent font-semibold outline-none"
      >
        <option value="all">{t("all")}</option>
        <option value="COP">COP</option>
        <option value="USD">USD</option>
      </select>
      <Icon
        name="angle-small-down"
        size={16}
        className="text-ink-2 pointer-events-none absolute right-3"
      />
    </div>
  );
}
