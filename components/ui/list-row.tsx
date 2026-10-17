"use client";

/**
 * Fila clicable de una lista (19-states.png, "Hover row" / "Selected").
 * Hover: fondo surface2. Seleccionada: ember-50 con borde ember-text de
 * 1.5 px. Sin desplazamiento al pasar el mouse (la spec lo quitó).
 */
import { cn } from "@/lib/utils";

type Props = React.ComponentProps<"button"> & {
  selected?: boolean;
  /** Contenido a la derecha (monto, estado). */
  trailing?: React.ReactNode;
};

export function ListRow({ selected = false, trailing, className, children, ...props }: Props) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        "rounded-control text-body text-ink flex min-h-[38px] w-full items-center justify-between gap-4 border-[1.5px] border-transparent px-4 py-2 text-left font-semibold",
        "transition-colors duration-100",
        selected ? "border-ember-text bg-ember-50" : "hover:bg-surface2",
        className,
      )}
      {...props}
    >
      <span className="min-w-0">{children}</span>
      {trailing !== undefined && <span className="shrink-0 tabular-nums">{trailing}</span>}
    </button>
  );
}
