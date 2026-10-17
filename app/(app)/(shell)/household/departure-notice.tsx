"use client";

/**
 * Aviso en Hogar cuando alguien sale y sus suscripciones compartidas quedan
 * sin cobro automático (0010). Cualquier miembro lo cierra para todo el hogar.
 */
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import type { Departure } from "@/lib/household/queries";

import { dismissDepartureNotice } from "./actions";

export function DepartureNotices({ departures }: { departures: Departure[] }) {
  const t = useTranslations("household");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const pendingNotices = departures.filter(
    (d) => !d.noticeDismissed && d.autoPostDisabled.length > 0,
  );
  if (pendingNotices.length === 0) return null;

  return (
    <div className="space-y-3">
      {pendingNotices.map((d) => (
        <section
          key={d.id}
          role="status"
          className="rounded-card bg-amber-tint flex flex-wrap items-start gap-4 p-5"
        >
          <span className="text-amber-text mt-0.5">
            <Icon name="info" />
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-headline text-ink">
              {t("departureTitle", { name: d.displayName ?? t("formerMember") })}
            </p>
            <p className="text-body text-ink-2">
              {t("departureAutoPost", {
                count: d.autoPostDisabled.length,
                names: d.autoPostDisabled.join(", "),
              })}
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await dismissDepartureNotice(d.id);
                router.refresh();
              })
            }
          >
            {t("departureDismiss")}
          </Button>
        </section>
      ))}
    </div>
  );
}
