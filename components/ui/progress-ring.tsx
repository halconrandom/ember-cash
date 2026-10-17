"use client";

/**
 * Anillo de progreso (03-savings.png). El naranja gráfico aquí codifica
 * "cuánto falta para mi objetivo", uno de los dos usos permitidos del
 * naranja como dato (DESIGN_SPEC §1); el valor siempre va escrito al centro.
 * Comportamiento del Animated Circular Progress Bar de Magic UI (spec §7):
 * se llena al aparecer solo en la primera carga de la pantalla y, después,
 * los cambios parten del valor actual. El aspecto sigue al frame (pista
 * completa y arco con punta redonda, sin el hueco entre arcos del original).
 * Con movimiento reducido el arco aparece lleno: `strokeDashoffset` no es
 * una propiedad de posición, así que motion no lo recorta solo.
 */
import { motion, useReducedMotionConfig } from "motion/react";

import { useFirstView } from "@/lib/motion/first-view";

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
  const first = useFirstView();
  // null en el servidor (mismo HTML que sin reducir). En el cliente, true
  // deja el trazo en el valor final sin dibujarlo.
  const reduce = useReducedMotionConfig() === true;
  const target = c * (1 - value / 100);
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
          // El arranque no depende de `reduce`: en el servidor es null y el
          // HTML tiene que coincidir. Con duración 0 el trazo salta al
          // valor final antes de pintar.
          initial={first ? { strokeDashoffset: c } : false}
          animate={{ strokeDashoffset: target }}
          transition={{ duration: reduce ? 0 : 0.6, ease: [0.23, 1, 0.32, 1] }}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center" aria-hidden>
        {children}
      </span>
    </div>
  );
}
