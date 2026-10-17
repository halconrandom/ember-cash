"use client";

/**
 * Sliding Number, adaptado de Animate UI (animate-ui.com, primitives/texts/
 * sliding-number): cada cifra es un rodillo de 0 a 9 que se desplaza con un
 * resorte (stiffness 200, damping 20, mass 0.4, los del original) hasta la
 * cifra nueva.
 *
 * Cambios para Ember Cash (modal de transacción, spec §7: "converted line
 * updates as the user types"):
 * - Recibe el texto ya formateado ("≈ US$ 21,60", "≈ 86.400 COP"): solo las
 *   cifras ruedan; símbolos y separadores del idioma quedan fijos.
 * - Las posiciones se cuentan desde la derecha, así una cifra nueva a la
 *   izquierda no hace rodar las demás.
 * - Arranca estable (sin animar al abrir); mide la altura con
 *   ResizeObserver en vez de react-use-measure (sin dependencia nueva).
 * - Con movimiento reducido muestra el texto tal cual.
 */
import {
  motion,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

const SPRING = { stiffness: 200, damping: 20, mass: 0.4 };

export function SlidingNumber({ text, className }: { text: string; className?: string }) {
  const reduce = useReducedMotion();
  if (reduce) return <span className={className}>{text}</span>;
  const chars = [...text];
  return (
    <span className={cn("inline-flex whitespace-pre tabular-nums", className)}>
      <span className="sr-only">{text}</span>
      <span aria-hidden className="inline-flex">
        {chars.map((ch, i) => {
          const fromEnd = chars.length - i;
          return /\d/.test(ch) ? (
            <Roller key={`d${fromEnd}`} digit={Number(ch)} />
          ) : (
            <span key={`c${fromEnd}`}>{ch}</span>
          );
        })}
      </span>
    </span>
  );
}

/** Rodillo de una cifra: diez números apilados que se mueven en Y. */
function Roller({ digit }: { digit: number }) {
  const value = useSpring(digit, SPRING);
  const ref = useRef<HTMLSpanElement>(null);
  const [height, setHeight] = useState(0);

  useEffect(() => {
    value.set(digit);
  }, [digit, value]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setHeight(entry.contentRect.height));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <span ref={ref} className="relative inline-block w-[1ch] overflow-y-clip">
      {/* Reserva el alto y el ancho de una cifra. */}
      <span className="invisible">0</span>
      {Array.from({ length: 10 }, (_, n) => (
        <Digit key={n} value={value} n={n} height={height} />
      ))}
    </span>
  );
}

/** Un número del rodillo; su Y depende de cuán lejos está de la cifra actual. */
function Digit({ value, n, height }: { value: MotionValue<number>; n: number; height: number }) {
  const y = useTransform(value, (latest) => {
    if (!height) return 0;
    const offset = (10 + n - (latest % 10)) % 10;
    let translate = offset * height;
    if (offset > 5) translate -= 10 * height;
    return translate;
  });
  if (!height) {
    return <span className="invisible absolute">{n}</span>;
  }
  return (
    <motion.span style={{ y }} className="absolute inset-0 flex items-center justify-center">
      {n}
    </motion.span>
  );
}
