"use client";

/**
 * Barra de progreso: relleno en naranja gráfico (progreso hacia un objetivo)
 * sobre el track. Se llena al aparecer (0,5 s ease-out) solo en la primera
 * carga de la pantalla (spec §7); al volver aparece llena, y un cambio de
 * valor parte del actual.
 * `barClassName` cambia el color del relleno (miembros, estados de presupuesto).
 */
import { motion } from "motion/react";

import { useFirstView } from "@/lib/motion/first-view";

import { cn } from "@/lib/utils";

export function ProgressBar({
  percent,
  label,
  className,
  barClassName,
}: {
  percent: number;
  label: string;
  className?: string;
  barClassName?: string;
}) {
  const value = Math.min(Math.max(percent, 0), 100);
  const first = useFirstView();
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      className={cn("bg-track h-2.5 w-full overflow-hidden rounded-full", className)}
    >
      <motion.div
        className={cn("bg-ember h-full rounded-full", barClassName)}
        initial={first ? { width: 0 } : false}
        animate={{ width: `${value}%` }}
        transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
      />
    </div>
  );
}
