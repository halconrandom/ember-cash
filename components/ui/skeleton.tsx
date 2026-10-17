/**
 * Skeleton de carga (19-states.png, "Loading"). Imita la geometría de la fila
 * final; el brillo es una opacidad suave que se detiene con movimiento
 * reducido (ver .animate-shimmer en globals.css).
 */
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div aria-hidden className={cn("animate-shimmer bg-track", className)} {...props} />;
}

/** Fila de transacción en carga: ícono 38 px, dos líneas y un monto. */
export function SkeletonRow() {
  return (
    <div className="flex h-[38px] items-center gap-4">
      <Skeleton className="size-[38px] shrink-0 rounded-md" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-40 max-w-full rounded-full" />
        <Skeleton className="bg-surface2 h-2 w-24 max-w-full rounded-full" />
      </div>
      <Skeleton className="h-3.5 w-[70px] rounded-full" />
    </div>
  );
}

/** Lista de filas en carga, con el texto accesible "Cargando". */
export function SkeletonList({ rows = 4, label }: { rows?: number; label?: string }) {
  const t = useTranslations("skeleton");
  return (
    <div role="status" aria-busy="true" className="space-y-[22px]">
      <span className="sr-only">{label ?? t("loading")}</span>
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  );
}
