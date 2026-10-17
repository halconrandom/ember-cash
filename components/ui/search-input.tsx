"use client";

/** Buscador en forma de píldora con ícono (fila de filtros). */
import { cn } from "@/lib/utils";

import { Icon } from "./icon";

type Props = Omit<React.ComponentProps<"input">, "type"> & { label: string };

export function SearchInput({ label, className, ...props }: Props) {
  return (
    <div className={cn("relative", className)}>
      <Icon
        name="search"
        size={18}
        className="text-ink-2 pointer-events-none absolute top-1/2 left-4 -translate-y-1/2"
      />
      <input
        type="search"
        aria-label={label}
        className="border-border bg-surface text-body text-ink placeholder:text-ink-3 h-10 w-full rounded-full border pr-4 pl-11"
        {...props}
      />
    </div>
  );
}
