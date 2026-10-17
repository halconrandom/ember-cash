"use client";

/**
 * Animated List, adaptado de Magic UI (magicui.design/r/animated-list):
 * cada elemento entra con opacidad y escala con el resorte del original
 * (stiffness 350, damping 40) y `layout`, así los demás se acomodan cuando
 * llega o se va uno.
 *
 * Cambios para Ember Cash (DESIGN_SPEC §7: "first load only; a newly added
 * transaction inserts at the top with a layout animation"):
 * - Sin la revelación uno por uno cada segundo del original (era una demo de
 *   notificaciones y haría crecer la lista mientras carga: salto de layout).
 *   Todos los elementos montan a la vez.
 * - La entrada solo corre en la primera carga (`animateOnMount`); después,
 *   lo que ya estaba aparece al instante y solo se anima lo que llega nuevo.
 * - Escala desde 0.95 en vez de 0: las filas ocupan todo el ancho.
 * - Con movimiento reducido (MotionConfig "user") queda solo la opacidad.
 *
 * <AnimatedList> no dibuja contenedor (lo pone quien la usa); sus hijos son
 * <AnimatedListItem> con `key`.
 */
import { AnimatePresence, motion, type HTMLMotionProps } from "motion/react";

const ITEM_TRANSITION = { type: "spring", stiffness: 350, damping: 40 } as const;

export function AnimatedList({
  animateOnMount,
  children,
}: {
  /** Animar la entrada de los elementos iniciales (solo la primera carga). */
  animateOnMount: boolean;
  children: React.ReactNode;
}) {
  return <AnimatePresence initial={animateOnMount}>{children}</AnimatePresence>;
}

type ItemTag = "li" | "div" | "article";

export function AnimatedListItem({
  as = "li",
  ...props
}: HTMLMotionProps<"li"> & { as?: ItemTag }) {
  const Component = motion[as] as typeof motion.li;
  return (
    <Component
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1, originY: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={ITEM_TRANSITION}
      {...props}
    />
  );
}
