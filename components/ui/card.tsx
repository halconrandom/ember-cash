/**
 * Tarjeta: superficie, radio 20, padding 24. En claro lleva sombra; en
 * oscuro, borde de 1 px (los dos salen de los tokens).
 */
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("rounded-card border-card-edge bg-surface shadow-card border p-6", className)}
      {...props}
    />
  );
}

/** Título de tarjeta (Headline 16 semibold). */
export function CardTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return <h2 className={cn("text-headline text-ink", className)} {...props} />;
}
