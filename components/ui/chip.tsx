"use client";

/**
 * Chips y badges (10-design-system.png, 19-states.png).
 * - <Badge>: etiqueta estática con el par texto/tinte de un tono ("On track",
 *   "Due Oct 22", "USD", "SAMPLE"). El color nunca es la única señal: siempre
 *   lleva texto.
 * - <ChoiceChip>: chip seleccionable. Sin seleccionar usa su tono (categoría);
 *   seleccionado pasa a ember-50 con check.
 */
import { motion } from "motion/react";

import { cn } from "@/lib/utils";

import { Icon } from "./icon";

export type Tone =
  | "positive"
  | "negative"
  | "warning"
  | "info"
  | "violet"
  | "pink"
  | "teal"
  | "olive"
  | "neutral"
  | "ember";

/** Clases por tono: fondo (tinte), texto y punto (gráfico). */
const TONES: Record<Tone, { bg: string; text: string; dot: string }> = {
  positive: { bg: "bg-positive-tint", text: "text-positive-text", dot: "bg-positive" },
  negative: { bg: "bg-negative-tint", text: "text-negative-text", dot: "bg-negative" },
  warning: { bg: "bg-amber-tint", text: "text-amber-text", dot: "bg-amber" },
  info: { bg: "bg-info-tint", text: "text-info-text", dot: "bg-info" },
  violet: { bg: "bg-violet-tint", text: "text-violet-text", dot: "bg-violet" },
  pink: { bg: "bg-pink-tint", text: "text-pink-text", dot: "bg-pink" },
  teal: { bg: "bg-teal-tint", text: "text-teal-text", dot: "bg-teal" },
  olive: { bg: "bg-olive-tint", text: "text-olive-text", dot: "bg-olive" },
  neutral: { bg: "bg-slate-tint", text: "text-slate-text", dot: "bg-slate" },
  ember: { bg: "bg-ember-50", text: "text-ember-text", dot: "bg-ember" },
};

type BadgeProps = React.ComponentProps<"span"> & {
  tone?: Tone;
  /** Punto de color a la izquierda. */
  dot?: boolean;
  size?: "sm" | "md";
};

export function Badge({
  tone = "neutral",
  dot,
  size = "md",
  className,
  children,
  ...props
}: BadgeProps) {
  const t = TONES[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap",
        size === "md" ? "text-callout h-7 px-3" : "text-footnote h-6 px-2.5",
        t.bg,
        t.text,
        className,
      )}
      {...props}
    >
      {dot && <span aria-hidden className={cn("size-1.5 rounded-full", t.dot)} />}
      {children}
    </span>
  );
}

type ChoiceChipProps = Omit<React.ComponentProps<"button">, "onChange"> & {
  tone?: Tone;
  selected: boolean;
};

export function ChoiceChip({
  tone = "neutral",
  selected,
  className,
  children,
  ...props
}: ChoiceChipProps) {
  const t = TONES[tone];
  return (
    <motion.button
      type="button"
      aria-pressed={selected}
      whileTap={{ scale: 0.97 }}
      transition={{ duration: 0.1, ease: [0.23, 1, 0.32, 1] }}
      className={cn(
        "text-callout inline-flex h-7 items-center gap-1.5 rounded-full px-3 font-medium whitespace-nowrap",
        selected ? "bg-ember-50 text-ember-text" : cn(t.bg, t.text),
        className,
      )}
      {...(props as React.ComponentProps<typeof motion.button>)}
    >
      {selected ? (
        <Icon name="check" size={14} />
      ) : (
        <span aria-hidden className={cn("size-1.5 rounded-full", t.dot)} />
      )}
      {children}
    </motion.button>
  );
}
