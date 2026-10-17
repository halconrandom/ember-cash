"use client";

/**
 * Barra de progreso: relleno en naranja gráfico (progreso hacia un objetivo)
 * sobre el track. Se llena una vez al aparecer (0,5 s ease-out).
 * `barClassName` cambia el color del relleno (miembros, estados de presupuesto).
 */
import { motion } from "motion/react";

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
        initial={{ width: 0 }}
        animate={{ width: `${value}%` }}
        transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
      />
    </div>
  );
}
