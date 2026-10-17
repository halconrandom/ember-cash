/**
 * Campo de texto con etiqueta y mensaje de error (19-states.png, "Inputs").
 * Estados: normal (surface2), foco (anillo global de 2 px), error (borde rojo
 * de 1.5 px, ícono y mensaje), deshabilitado (gris).
 */
import { useId } from "react";

import { cn } from "@/lib/utils";

import { Icon } from "./icon";

type InputProps = React.ComponentProps<"input"> & { invalid?: boolean };

export function Input({ className, invalid, ...props }: InputProps) {
  return (
    <div className="relative">
      {invalid && (
        <Icon
          name="info"
          size={18}
          className="text-negative-text pointer-events-none absolute top-1/2 left-4 -translate-y-1/2"
        />
      )}
      <input
        aria-invalid={invalid || undefined}
        className={cn(
          "rounded-control bg-surface2 text-body text-ink h-11 w-full border border-transparent px-4",
          "placeholder:text-ink-3",
          "aria-invalid:border-negative aria-invalid:border-[1.5px] aria-invalid:pl-11",
          "disabled:bg-control-muted disabled:text-control-muted-text disabled:placeholder:text-control-muted-text disabled:cursor-not-allowed",
          className,
        )}
        {...props}
      />
    </div>
  );
}

type FieldProps = Omit<InputProps, "id"> & {
  label: string;
  /** Mensaje de error; si existe, el campo se marca inválido. */
  error?: string | null;
  /** Texto de ayuda bajo el campo. */
  hint?: string;
  id?: string;
};

export function Field({ label, error, hint, id, className, ...props }: FieldProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const messageId = `${inputId}-message`;
  const message = error ?? hint;

  return (
    <div className={cn("space-y-2", className)}>
      <label htmlFor={inputId} className="text-callout text-ink-2 block font-semibold">
        {label}
      </label>
      <Input
        id={inputId}
        invalid={Boolean(error)}
        aria-describedby={message ? messageId : undefined}
        {...props}
      />
      {message && (
        <p
          id={messageId}
          role={error ? "alert" : undefined}
          className={cn("text-callout", error ? "text-negative-text" : "text-ink-3")}
        >
          {message}
        </p>
      )}
    </div>
  );
}
