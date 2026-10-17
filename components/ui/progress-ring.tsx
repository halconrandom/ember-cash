"use client";

/**
 * Anillo de progreso (03-savings.png). El naranja gráfico aquí codifica
 * "cuánto falta para mi objetivo", uno de los dos usos permitidos del
 * naranja como dato (DESIGN_SPEC §1); el valor siempre va escrito al centro.
 * Se llena una vez al aparecer; después, los cambios parten del valor actual.
 * Con movimiento reducido, motion lo muestra sin animación.
 */
import { motion } from "motion/react";

type Props = {
  /** 0 a 100. */
  percent: number;
  size?: number;
  stroke?: number;
  /** Texto accesible ("57 % del objetivo"). */
  label: string;
  children?: React.ReactNode;
};

export function ProgressRing({ percent, size = 124, stroke = 14, label, children }: Props) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const value = Math.min(Math.max(percent, 0), 100);
  return (
    <div
      role="img"
      aria-label={label}
      className="relative grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--track)"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--ember)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - value / 100) }}
          transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center" aria-hidden>
        {children}
      </span>
    </div>
  );
}
