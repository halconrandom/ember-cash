"use client";

/**
 * Primeros pasos en el panel. Cada pendiente es un enlace; lo hecho se queda
 * con un check. Al completar los cuatro se deja el texto de cierre hasta que
 * se oculta. Descartar la quita para siempre (first_steps_dismissed_at).
 */
import Link from "next/link";
import { useTranslations } from "next-intl";

import { Card, CardTitle } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { firstStepItems, type FirstStepFlags } from "@/lib/onboarding/first-steps";

export function FirstStepsCard({
  flags,
  onDismiss,
}: {
  flags: FirstStepFlags;
  onDismiss: () => Promise<void>;
}) {
  const t = useTranslations("firstSteps");
  const { items, done, total, allDone } = firstStepItems(flags);

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <CardTitle>{t("title")}</CardTitle>
          {!allDone && (
            <p className="text-body text-ink-2 mt-1">{t("subtitle", { done, total })}</p>
          )}
        </div>
        <form action={onDismiss}>
          <button type="submit" className="text-body text-ink-2 min-h-11 font-semibold">
            {t("dismiss")}
          </button>
        </form>
      </div>
      {allDone ? (
        <p className="text-body text-ink-2">{t("complete")}</p>
      ) : (
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.key}>
              {item.done ? (
                <p className="text-body text-ink-3 flex min-h-11 items-center gap-3">
                  <Icon name="check" size={18} />
                  <span>{t(item.key)}</span>
                </p>
              ) : (
                <Link
                  href={item.href}
                  className="text-body text-ink flex min-h-11 items-center gap-3"
                >
                  <span aria-hidden className="border-border size-5 shrink-0 rounded-full border" />
                  <span>{t(item.key)}</span>
                </Link>
              )}
              {item.key === "household" && (
                <p className="text-body text-ink-2 pb-2 pl-8">{t("householdHelp")}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
