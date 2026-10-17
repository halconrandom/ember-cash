"use client";

/**
 * Campo de fecha con el formato del frame ("vie, 16 de oct de 2026"): el
 * texto se ve formateado y un <input type="date"> transparente encima abre el
 * selector nativo (accesible con teclado). Sin valor muestra `placeholder`.
 */
import { useId } from "react";

import { useFormat } from "@/lib/i18n/use-format";
import { cn } from "@/lib/utils";

import { Icon } from "./icon";

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  placeholder?: string;
  min?: string;
  max?: string;
};

export function DateField({ label, value, onChange, error, placeholder, min, max }: Props) {
  const f = useFormat();
  const id = useId();
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-callout text-ink-2 block font-semibold">
        {label}
      </label>
      <div
        className={cn(
          "rounded-control bg-surface2 relative flex h-11 items-center gap-3 border px-4",
          "has-[input:focus-visible]:outline-focus-ring has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-solid",
          error ? "border-negative border-[1.5px]" : "border-transparent",
        )}
      >
        <Icon name="calendar" className="text-ink-2" />
        <span className={cn("text-body flex-1", value ? "text-ink" : "text-ink-3")}>
          {value ? f.date(value, "weekdayDateYear") : placeholder}
        </span>
        <Icon name="angle-small-down" size={18} className="text-ink-2" />
        <input
          id={id}
          type="date"
          value={value}
          min={min}
          max={max}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </div>
      {error && (
        <p role="alert" className="text-callout text-negative-text">
          {error}
        </p>
      )}
    </div>
  );
}
