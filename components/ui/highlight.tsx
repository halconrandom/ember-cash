"use client";

/**
 * Highlight, adaptado de Animate UI (animate-ui.com, primitives/effects/
 * highlight, modo "children"): un fondo compartido (motion layoutId) que se
 * desliza al elemento activo y, con `hover`, sigue al puntero y vuelve al
 * activo al salir (tras `exitDelay`, 200 ms como el original). Mismo resorte
 * por defecto que la librería (stiffness 350, damping 35).
 *
 * Versión reducida para Ember Cash: sin modo "parent" ni medición de bordes;
 * cada elemento dibuja su fondo con <HighlightBackground> y conecta el hover
 * con useHighlightItem. Con movimiento reducido, MotionConfig lo vuelve un
 * cambio sin desplazamiento.
 *
 * Usos (spec §7): elemento activo del sidebar, píldora de los controles
 * segmentados (Tabs) y contorno de la categoría elegida en el modal.
 */
import { motion, type Transition } from "motion/react";
import { createContext, useContext, useEffect, useId, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type HighlightContextValue = {
  id: string;
  /** Valor que lleva el fondo ahora (el activo o el que está bajo el puntero). */
  shown: string | null;
  hover: boolean;
  enter: (value: string) => void;
  leave: () => void;
  transition: Transition;
};

const HighlightContext = createContext<HighlightContextValue | null>(null);

const LIBRARY_SPRING: Transition = { type: "spring", stiffness: 350, damping: 35 };

type Props = {
  /** Valor activo (ruta, opción elegida). */
  value: string | null;
  /** El fondo sigue al puntero y vuelve al activo al salir. */
  hover?: boolean;
  exitDelay?: number;
  transition?: Transition;
  children: React.ReactNode;
};

export function Highlight({
  value,
  hover = false,
  exitDelay = 200,
  transition = LIBRARY_SPRING,
  children,
}: Props) {
  const id = useId();
  const [hovered, setHovered] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const enter = (next: string) => {
    if (!hover) return;
    if (timer.current) clearTimeout(timer.current);
    setHovered(next);
  };
  const leave = () => {
    if (!hover) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setHovered(null), exitDelay);
  };

  return (
    <HighlightContext.Provider
      value={{ id, shown: hovered ?? value, hover, enter, leave, transition }}
    >
      {children}
    </HighlightContext.Provider>
  );
}

/**
 * Estado de un elemento: si lleva el fondo y los manejadores de hover para
 * ponerlos en el elemento. Fuera de un <Highlight>, usa `fallbackActive`.
 *
 * Solo el mouse (y el foco del teclado) mueve el fondo. En iOS un toque
 * también dispara pointerenter; si eso cambia el DOM antes del clic, Safari
 * toma el primer toque como hover y el enlace pide un segundo toque.
 */
export function useHighlightItem(value: string, fallbackActive = false) {
  const ctx = useContext(HighlightContext);
  return {
    highlighted: ctx ? ctx.shown === value : fallbackActive,
    handlers: ctx?.hover
      ? {
          onPointerEnter: (event: React.PointerEvent) => {
            if (event.pointerType === "mouse") ctx.enter(value);
          },
          onPointerLeave: (event: React.PointerEvent) => {
            if (event.pointerType === "mouse") ctx.leave();
          },
          onFocus: (event: React.FocusEvent) => {
            if (isKeyboardFocus(event.target)) ctx.enter(value);
          },
          onBlur: () => ctx.leave(),
        }
      : {},
  };
}

/**
 * Fondo compartido. Va dentro de un elemento con `relative`; el contenido del
 * elemento debe ir en una capa `relative` encima.
 */
export function HighlightBackground({ show, className }: { show: boolean; className?: string }) {
  const ctx = useContext(HighlightContext);
  if (!show) return null;
  return (
    <motion.span
      aria-hidden
      layoutId={ctx ? `highlight-${ctx.id}` : undefined}
      transition={ctx?.transition ?? LIBRARY_SPRING}
      className={cn("absolute inset-0", className)}
    />
  );
}

/** ¿El foco vino del teclado? (un toque o clic no cuenta). */
function isKeyboardFocus(target: EventTarget): boolean {
  return target instanceof Element && target.matches(":focus-visible");
}
