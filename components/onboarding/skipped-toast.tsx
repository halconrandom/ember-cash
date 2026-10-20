"use client";

/**
 * Aviso después de Omitir. La página solo lo monta con ?skipped=1; al mostrarse
 * quita el query para que un refresco no lo repita.
 */
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { useToast } from "@/components/ui/toast";

export function SkippedToast() {
  const t = useTranslations("onboarding.skipped");
  const toast = useToast();
  const router = useRouter();
  const shown = useRef(false);

  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    toast.show({ message: t("toast") });
    router.replace("/");
  }, [router, t, toast]);

  return null;
}
