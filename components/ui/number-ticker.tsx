"use client";

/**
 * Number Ticker, adaptado de Magic UI (magicui.design/r/number-ticker):
 * mismo resorte (damping 60, stiffness 100) y se dispara una vez al entrar
 * en pantalla (useInView once).
 *
 * Cambios para Ember Cash (DESIGN_SPEC §7):
 * - Solo corre si `animate` es true (primera carga de la pantalla). Después,
 *   un cambio de valor (otra moneda u otro mes) salta directo al nuevo número.
 * - Formatea con la función que recibe (formato de dinero del idioma), no
 *   con Intl en inglés.
 * - Reserva el ancho del valor final (copia invisible), así el texto vecino
 *   ("COP") no se mueve mientras cuenta: sin saltos de layout.
 * - El lector de pantalla lee siempre el valor final.
 * - Con movimiento reducido muestra el valor final sin contar.
 */
import { useInView, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

type Props = {
  value: number;
  /** Convierte el número (unidades menores) en el texto a mostrar. */
  format: (value: number) => string;
  /** Contar desde 0 al aparecer (solo en la primera carga). */
  animate: boolean;
  className?: string;
};

export function NumberTicker({ value, format, animate, className }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduce = useReducedMotion();
  const ticking = animate && !reduce;
  const motionValue = useMotionValue(ticking ? 0 : value);
  const springValue = useSpring(motionValue, { damping: 60, stiffness: 100 });
  const isInView = useInView(ref, { once: true, margin: "0px" });
  // ¿Ya contó una vez? Los cambios siguientes saltan sin animación.
  const done = useRef(!ticking);

  useEffect(() => {
    if (!done.current) {
      if (!isInView) return;
      done.current = true;
      motionValue.set(value);
      return;
    }
    // Cambio posterior (moneda o mes): directo al valor, sin contar.
    motionValue.jump(value);
    springValue.jump(value);
  }, [isInView, value, motionValue, springValue]);

  useEffect(
    () =>
      springValue.on("change", (latest) => {
        if (ref.current) ref.current.textContent = format(Math.round(latest));
      }),
    [springValue, format],
  );

  return (
    <span className={cn("relative inline-block whitespace-nowrap", className)}>
      {/* Ancho reservado con el valor final (invisible) y texto accesible. */}
      <span aria-hidden className="invisible">
        {format(value)}
      </span>
      <span className="sr-only">{format(value)}</span>
      {/* El servidor no sabe si hay movimiento reducido: puede diferir del cliente. */}
      <span
        ref={ref}
        aria-hidden
        suppressHydrationWarning
        className="absolute inset-y-0 right-0 text-right"
      >
        {format(ticking ? 0 : value)}
      </span>
    </span>
  );
}
