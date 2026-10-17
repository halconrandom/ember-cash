"use client";

/**
 * Borrado reversible de una transacción (DESIGN_SPEC §7): borrado suave al
 * instante, toast de 6 s con Deshacer y borrado definitivo cuando el toast
 * vence. Deshacer restaura la fila (deleted_at = null).
 */
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback } from "react";

import {
  deleteTransaction,
  purgeTransaction,
  restoreTransaction,
} from "@/app/(app)/(shell)/transactions/actions";
import { useToast } from "@/components/ui/toast";

export function useDeleteTransaction() {
  const toast = useToast();
  const router = useRouter();
  const t = useTranslations("transactions");

  return useCallback(
    async (id: string): Promise<boolean> => {
      const result = await deleteTransaction(id);
      if (!result.ok) {
        toast.show({ message: t("deleteFailed") });
        return false;
      }
      router.refresh();
      toast.show({
        message: t("deleted"),
        onUndo: async () => {
          await restoreTransaction(id);
          router.refresh();
          toast.show({ message: t("restored") });
        },
        // Sin Deshacer en 6 s, el borrado es definitivo.
        onExpire: () => void purgeTransaction(id),
      });
      return true;
    },
    [router, t, toast],
  );
}
