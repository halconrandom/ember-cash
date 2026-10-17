"use client";

/**
 * Tooltip (19-states.png). Aparece con hover del mouse o con foco; la primera
 * vez espera un poco y, si el usuario sigue recorriendo elementos, los
 * siguientes salen al instante. Esc lo cierra. El disparador queda enlazado
 * con aria-describedby. Un toque no lo abre por hover (en iOS haría que el
 * primer toque no llegue al clic); en el teléfono se abre con el foco.
 */
import { cloneElement, isValidElement, useEffect, useId, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/** Espera antes del primer tooltip. */
const FIRST_DELAY_MS = 500;
/** Tiempo durante el cual los siguientes tooltips son instantáneos. */
const WARM_WINDOW_MS = 800;
let lastHiddenAt = 0;

type Props = {
  content: React.ReactNode;
  /** Un único elemento que recibe hover y foco. */
  children: React.ReactElement<React.HTMLAttributes<HTMLElement>>;
  side?: "top" | "bottom";
  className?: string;
};

export function Tooltip({ content, children, side = "top", className }: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    if (timer.current) clearTimeout(timer.current);
    const warm = Date.now() - lastHiddenAt < WARM_WINDOW_MS;
    timer.current = setTimeout(() => setOpen(true), warm ? 0 : FIRST_DELAY_MS);
  };
  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    setOpen((wasOpen) => {
      if (wasOpen) lastHiddenAt = Date.now();
      return false;
    });
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && hide();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const trigger = isValidElement(children)
    ? cloneElement(children, { "aria-describedby": open ? id : undefined })
    : children;

  return (
    <span
      className="relative inline-flex"
      onPointerEnter={(event) => event.pointerType === "mouse" && show()}
      onPointerLeave={(event) => event.pointerType === "mouse" && hide()}
      onFocus={show}
      onBlur={hide}
    >
      {trigger}
      {open && (
        <span
          role="tooltip"
          id={id}
          className={cn(
            "absolute left-1/2 z-40 -translate-x-1/2",
            side === "top" ? "bottom-full mb-2" : "top-full mt-2",
            className,
          )}
        >
          <TooltipSurface>{content}</TooltipSurface>
        </span>
      )}
    </span>
  );
}

/** Aspecto del tooltip, también usado estático en el design system. */
export function TooltipSurface({ children }: { children: React.ReactNode }) {
  return (
    <span className="border-toast-border bg-toast-bg text-callout text-toast-text shadow-pop inline-flex min-h-[30px] items-center rounded-sm border px-3 font-semibold whitespace-nowrap">
      {children}
    </span>
  );
}
