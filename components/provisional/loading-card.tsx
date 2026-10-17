/**
 * Placeholder PROVISIONAL mientras carga contenido dinámico (fallback de
 * <Suspense>). La fase 4 lo reemplaza por skeletons con la geometría final.
 */
import { ui } from "./styles";

export function LoadingCard({ label = "Cargando" }: { label?: string }) {
  return (
    <div className={`${ui.card} h-32 w-full`} role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div className="bg-muted h-4 w-1/3 rounded-full motion-safe:animate-pulse" />
      <div className="bg-muted mt-3 h-3 w-1/2 rounded-full motion-safe:animate-pulse" />
    </div>
  );
}
