"use client";

/**
 * Selector de mes de la topbar ("‹ Octubre de 2026 ›"). Guarda el mes en la
 * URL (?month=AAAA-MM) y vuelve el rango de fechas a "ese mes". La etiqueta
 * se desliza 8 px en la dirección del clic (150 ms); el contenido no se anima.
 */
import { AnimatePresence, motion } from "motion/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Icon } from "@/components/ui/icon";
import { useFormat } from "@/lib/i18n/use-format";
import { MONTH_PATTERN, shiftMonth, todayIn } from "@/lib/transactions/dates";
import { withFilters } from "@/lib/transactions/filters";

export function MonthSelector() {
  const t = useTranslations("monthSelector");
  const f = useFormat();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  // Dirección del último clic (-1 o 1) para deslizar la etiqueta.
  const [direction, setDirection] = useState(1);

  const param = params.get("month");
  const month = param && MONTH_PATTERN.test(param) ? param : todayIn().slice(0, 7);
  const label = f.date(`${month}-01`, "monthYear");
  const display = label.charAt(0).toUpperCase() + label.slice(1);

  function go(delta: number) {
    setDirection(delta);
    const next = shiftMonth(month, delta);
    startTransition(() =>
      router.replace(`${pathname}${withFilters(params, { month: next, range: null })}`, {
        scroll: false,
      }),
    );
  }

  const arrow =
    "grid size-8 place-items-center rounded-full text-ink-2 transition-colors duration-100 hover:bg-surface2 hover:text-ink";
  return (
    <div
      role="group"
      aria-label={t("label")}
      className="border-border bg-surface inline-flex h-10 items-center gap-1 rounded-full border px-1"
    >
      <button type="button" className={arrow} onClick={() => go(-1)} aria-label={t("previous")}>
        <Icon name="angle-small-left" size={18} />
      </button>
      <span
        className="text-body text-ink relative min-w-[8rem] overflow-hidden text-center font-semibold"
        aria-live="polite"
      >
        <AnimatePresence mode="popLayout" initial={false} custom={direction}>
          <motion.span
            key={month}
            className="block"
            initial={{ x: 8 * direction, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -8 * direction, opacity: 0 }}
            transition={{ duration: 0.15, ease: [0.23, 1, 0.32, 1] }}
          >
            {display}
          </motion.span>
        </AnimatePresence>
      </span>
      <button type="button" className={arrow} onClick={() => go(1)} aria-label={t("next")}>
        <Icon name="angle-small-right" size={18} />
      </button>
    </div>
  );
}
