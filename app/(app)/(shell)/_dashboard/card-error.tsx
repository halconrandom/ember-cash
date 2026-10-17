"use client";

/**
 * Tarjeta en estado de error: una consulta que falla no rompe las demás.
 * "Reintentar" vuelve a pedir la página (solo se rehacen las lecturas).
 */
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export function CardError({ title, className }: { title: string; className?: string }) {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Card role="alert" className={cn("flex flex-col gap-3", className)}>
      <h2 className="text-headline text-ink">{title}</h2>
      <p className="text-body text-ink-2 flex items-center gap-2">
        <Icon name="info" size={18} className="text-negative-text" />
        {t("cardError")}
      </p>
      <Button
        size="sm"
        variant="secondary"
        className="self-start"
        disabled={pending}
        onClick={() => startTransition(() => router.refresh())}
      >
        {t("retry")}
      </Button>
    </Card>
  );
}
