"use client";

/**
 * Popover de jerga (Avalanche/Snowball, APR, 50/50): un término subrayado
 * que, al tocarlo, muestra su definición (glossary.*) en una tarjeta chica.
 * Se cierra al tocar fuera, con Escape o tocando el término otra vez. No
 * atrapa el foco: es información corta, no un diálogo.
 */
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type Term = "avalanche" | "snowball" | "apr" | "fiftyFifty";

type Props = {
  term: Term;
  children: React.ReactNode;
  className?: string;
};

export function GlossaryTerm({ term, children, className }: Props) {
  const t = useTranslations("glossary");
  const id = useId();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "text-ember-text underline decoration-dotted underline-offset-2",
          className,
        )}
      >
        {children}
      </button>
      {open && (
        <span
          id={id}
          role="note"
          className="border-toast-border bg-toast-bg text-toast-text shadow-pop text-callout absolute bottom-full left-0 z-40 mb-2 w-64 rounded-sm border p-3"
        >
          {t(term)}
        </span>
      )}
    </span>
  );
}
