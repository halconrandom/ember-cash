"use client";

/** Estado de error del Calendario: mensaje claro y Reintentar. */
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { startTransition } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export default function CalendarError({ reset }: { error: Error; reset: () => void }) {
  const t = useTranslations("calendar");
  const router = useRouter();
  return (
    <EmptyState
      icon="info"
      title={t("errorTitle")}
      description={t("errorDescription")}
      actions={
        <Button
          icon="refresh"
          variant="secondary"
          onClick={() =>
            startTransition(() => {
              router.refresh();
              reset();
            })
          }
        >
          {t("retry")}
        </Button>
      }
    />
  );
}
