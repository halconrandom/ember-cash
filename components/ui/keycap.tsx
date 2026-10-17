/** Tecla del teclado ("Enter", "Space") para instrucciones. */
import { cn } from "@/lib/utils";

export function Keycap({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      className={cn(
        "border-border bg-surface text-callout text-ink inline-flex h-8 items-center rounded-sm border px-3 font-sans font-semibold",
        className,
      )}
      {...props}
    />
  );
}
