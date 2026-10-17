"use client";

/**
 * Campo de selección con etiqueta e ícono (07-add-transaction.png: Cuenta,
 * Pagó). <select> nativo con el aspecto de los campos (surface2, radio 12).
 */
import { useId } from "react";

import { cn } from "@/lib/utils";

import { Icon } from "./icon";
import type { IconName } from "./icon-registry";
import type { SelectOption } from "./select-chip";

type Props = {
  label: string;
  icon?: IconName;
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string | null;
  className?: string;
};

export function SelectField({
  label,
  icon,
  value,
  options,
  onChange,
  placeholder,
  error,
  className,
}: Props) {
  const id = useId();
  return (
    <div className={cn("space-y-2", className)}>
      <label htmlFor={id} className="text-callout text-ink-2 block font-semibold">
        {label}
      </label>
      <div className="relative">
        {icon && (
          <Icon
            name={icon}
            className="text-ink-2 pointer-events-none absolute top-1/2 left-4 -translate-y-1/2"
          />
        )}
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={cn(
            "rounded-control bg-surface2 text-body text-ink h-11 w-full cursor-pointer appearance-none border border-transparent pr-10",
            icon ? "pl-12" : "pl-4",
            "aria-invalid:border-negative aria-invalid:border-[1.5px]",
          )}
        >
          {placeholder !== undefined && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <Icon
          name="angle-small-down"
          size={18}
          className="text-ink-2 pointer-events-none absolute top-1/2 right-4 -translate-y-1/2"
        />
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-callout text-negative-text">
          {error}
        </p>
      )}
    </div>
  );
}
