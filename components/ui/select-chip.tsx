"use client";

/**
 * Chip de selección para la fila de filtros (02-transactions.png): ícono,
 * texto de la opción elegida y flecha. El chip mide lo que su texto (como en
 * el frame): se muestra la etiqueta elegida y encima va un <select> nativo
 * transparente, que da teclado y lector de pantalla sin trabajo extra. El
 * anillo de foco se dibuja en el chip. Si `active`, toma el tinte ember-50.
 */
import { useId } from "react";

import { cn } from "@/lib/utils";

import { Icon } from "./icon";
import type { IconName } from "./icon-registry";

export type SelectOption = { value: string; label: string; group?: string };

type Props = {
  label: string;
  icon: IconName;
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  active?: boolean;
  className?: string;
};

export function SelectChip({
  label,
  icon,
  value,
  options,
  onChange,
  active = false,
  className,
}: Props) {
  const id = useId();
  const groups = [...new Set(options.map((o) => o.group ?? ""))];
  const selected = options.find((o) => o.value === value)?.label ?? "";
  return (
    <div
      className={cn(
        "text-body relative inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border pr-2.5 pl-3 font-medium whitespace-nowrap transition-colors duration-100",
        "has-[select:focus-visible]:outline-focus-ring has-[select:focus-visible]:outline-2 has-[select:focus-visible]:outline-offset-2 has-[select:focus-visible]:outline-solid",
        active
          ? "bg-ember-50 text-ember-text border-transparent"
          : "border-border bg-surface text-ink hover:bg-surface2",
        className,
      )}
    >
      <Icon name={icon} size={18} />
      <span aria-hidden>{selected}</span>
      <Icon name="angle-small-down" size={16} />
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer appearance-none rounded-full opacity-0"
      >
        {groups.map((g) =>
          g ? (
            <optgroup key={g} label={g}>
              {options
                .filter((o) => o.group === g)
                .map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
            </optgroup>
          ) : (
            options
              .filter((o) => !o.group)
              .map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))
          ),
        )}
      </select>
    </div>
  );
}
