/**
 * Marco de las tarjetas del dashboard. Toda la tarjeta es un enlace a su
 * pantalla ("Cada tarjeta enlaza a su pantalla"), con el foco global y un
 * cambio de borde al pasar el mouse (solo las clicables reaccionan).
 */
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export const CARD_CLASSES = "rounded-card border-card-edge bg-surface shadow-card border p-6";

export function DashboardCard({
  href,
  label,
  className,
  children,
}: {
  href: string;
  /** Nombre accesible del enlace (ya traducido). */
  label?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      className={cn(
        CARD_CLASSES,
        "hover:border-border block transition-colors duration-100",
        className,
      )}
    >
      {children}
    </Link>
  );
}

/** Placeholder de una tarjeta mientras carga (misma altura, sin salto). */
export function CardSkeleton({ className, rows = 3 }: { className?: string; rows?: number }) {
  return (
    <Card className={cn("space-y-4", className)} role="status" aria-busy="true">
      <Skeleton className="h-4 w-36 rounded-full" />
      <Skeleton className="h-8 w-48 rounded-full" />
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-3 w-full rounded-full" />
      ))}
    </Card>
  );
}
