"use client";

/**
 * Control segmentado (COP/USD, Personal/Shared, filtros, tema): las Tabs de
 * Animate UI con TabsHighlight (spec §7). Grupo de radios con flechas del
 * teclado; la píldora activa es un Highlight que se desliza con el resorte
 * de la librería. Los valores cambian al instante (sin ticker).
 */
import { useRef } from "react";

import { cn } from "@/lib/utils";

import { Highlight, HighlightBackground } from "./highlight";

type Option<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Nombre accesible del grupo. */
  label: string;
  className?: string;
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: Props<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (!step) return;
    event.preventDefault();
    const next = (index + step + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "border-seg-border bg-seg-track inline-flex h-10 items-center rounded-full border p-1",
        className,
      )}
    >
      <Highlight value={value}>
        {options.map((option, i) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(option.value)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cn(
                "text-callout relative h-8 rounded-full px-4 font-semibold transition-colors duration-100",
                active ? "text-ink" : "text-ink-2 hover:text-ink",
              )}
            >
              <HighlightBackground
                show={active}
                className="bg-seg-thumb shadow-card rounded-full"
              />
              <span className="relative">{option.label}</span>
            </button>
          );
        })}
      </Highlight>
    </div>
  );
}
