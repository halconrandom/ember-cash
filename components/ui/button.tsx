"use client";

/**
 * Botón de Ember Cash (19-states.png, 10-design-system.png).
 *
 * Variantes:
 * - primary: ember-fill con texto blanco. Uno solo por pantalla.
 * - secondary: superficie con borde.
 * - soft: tinte ember-50 con texto ember-text.
 * - danger: relleno rojo (#B3363B), para "Press again to confirm".
 * - danger-outline: borde rojo, texto normal (primer paso del borrado).
 * Estados: hover/pressed (ember-press), pressed escala 0.97 en 100 ms,
 * foco con el anillo global, deshabilitado en gris.
 * Sin glow: CLAUDE.md prohíbe glows decorativos.
 */
import { motion, type HTMLMotionProps } from "motion/react";

import { cn } from "@/lib/utils";

import { Icon } from "./icon";
import type { IconName } from "./icon-registry";

export type ButtonVariant = "primary" | "secondary" | "soft" | "danger" | "danger-outline";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-ember-fill text-white hover:bg-ember-press active:bg-ember-press",
  secondary: "border border-border bg-surface text-ink hover:bg-surface2",
  soft: "bg-ember-50 text-ember-text hover:bg-ember-100",
  danger: "bg-danger-fill text-white",
  "danger-outline": "border-[1.5px] border-negative bg-surface text-ink hover:bg-negative-tint",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-4 text-callout",
  md: "h-10 px-6 text-body",
  lg: "h-11 px-6 text-body",
};

/** Clases del botón, para reutilizarlas en enlaces con aspecto de botón. */
export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md") {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap select-none",
    "transition-colors duration-100 ease-[var(--ease-out-ember)]",
    "disabled:pointer-events-none disabled:border-transparent disabled:bg-control-muted disabled:text-control-muted-text",
    VARIANTS[variant],
    SIZES[size],
  );
}

type ButtonProps = HTMLMotionProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Ícono a la izquierda del texto. */
  icon?: IconName;
  children?: React.ReactNode;
};

export function Button({
  variant = "primary",
  size = "md",
  icon,
  className,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <motion.button
      type={type}
      // Respuesta inmediata al presionar: escala 0.97, 100 ms ease-out.
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.1, ease: [0.23, 1, 0.32, 1] }}
      className={cn(buttonClasses(variant, size), className)}
      {...props}
    >
      {icon && <Icon name={icon} size={size === "sm" ? 16 : 18} />}
      {children}
    </motion.button>
  );
}
