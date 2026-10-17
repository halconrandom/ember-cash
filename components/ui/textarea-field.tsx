/** Área de texto con etiqueta (Notas en 07-add-transaction.png). */
import { useId } from "react";

import { cn } from "@/lib/utils";

type Props = React.ComponentProps<"textarea"> & { label: string; error?: string | null };

export function TextareaField({ label, error, className, ...props }: Props) {
  const id = useId();
  return (
    <div className={cn("space-y-2", className)}>
      <label htmlFor={id} className="text-callout text-ink-2 block font-semibold">
        {label}
      </label>
      <textarea
        id={id}
        aria-invalid={error ? true : undefined}
        className="rounded-control bg-surface2 text-body text-ink placeholder:text-ink-3 aria-invalid:border-negative min-h-24 w-full resize-y border border-transparent px-4 py-3 aria-invalid:border-[1.5px]"
        {...props}
      />
      {error && (
        <p role="alert" className="text-callout text-negative-text">
          {error}
        </p>
      )}
    </div>
  );
}
