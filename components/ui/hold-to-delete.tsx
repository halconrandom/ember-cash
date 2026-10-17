"use client";

/**
 * Borrado irreversible (DESIGN_SPEC §5, 19-states.png). Tres caminos
 * equivalentes:
 *
 * 1. <HoldToDeleteButton> con puntero: mantener 2 s; el relleno barre de
 *    izquierda a derecha; soltar cancela.
 * 2. El mismo botón con teclado: mantener Enter o Espacio 2 s; soltar la
 *    tecla o Esc cancela. Lo anuncia con aria-describedby.
 * 3. <TwoStepDeleteButton>: el primer clic cambia a "Press again to confirm";
 *    un segundo clic antes de 4 s confirma. Es el respaldo para control por
 *    interruptor o por voz. Después, quien lo usa muestra un toast con Undo.
 *
 * El texto y el ícono usan el color de texto (no rojo): rojo sobre el relleno
 * daba 3.29 / 3.64 y la spec lo rechazó. El rojo queda solo en el borde.
 */
import { motion, MotionConfig } from "motion/react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import { Icon } from "./icon";

/** Tiempo que hay que mantener (spec: 2 s). */
export const HOLD_DURATION_MS = 2000;
/** Ventana para el segundo clic (spec: 4 s). */
export const TWO_STEP_WINDOW_MS = 4000;

type HoldProps = {
  label?: string;
  /** Qué se borra, para el anuncio accesible ("debt"). */
  itemName?: string;
  onConfirm: () => void;
  duration?: number;
  /** Solo para documentación: dibuja el relleno fijo en esa fracción (0 a 1). */
  demoProgress?: number;
  className?: string;
};

export function HoldToDeleteButton({
  label = "Hold to delete",
  itemName = "item",
  onConfirm,
  duration = HOLD_DURATION_MS,
  demoProgress,
  className,
}: HoldProps) {
  const [holding, setHolding] = useState(false);
  const [status, setStatus] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hintId = useId();

  const cancel = useCallback(() => {
    if (!timer.current) return;
    clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
    setStatus("Cancelled");
  }, []);

  const start = useCallback(() => {
    if (timer.current) return;
    setHolding(true);
    setStatus("Keep holding");
    timer.current = setTimeout(() => {
      timer.current = null;
      setHolding(false);
      setStatus("");
      onConfirm();
    }, duration);
  }, [duration, onConfirm]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const progress = demoProgress ?? (holding ? 1 : 0);

  return (
    <>
      <button
        type="button"
        aria-describedby={hintId}
        // El clic normal no hace nada: hay que mantener.
        onClick={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture?.(e.pointerId);
          start();
        }}
        onPointerUp={cancel}
        onPointerCancel={cancel}
        onLostPointerCapture={cancel}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!e.repeat) start();
          } else if (e.key === "Escape") {
            cancel();
          }
        }}
        onKeyUp={(e) => {
          if (e.key === "Enter" || e.key === " ") cancel();
        }}
        onBlur={cancel}
        className={cn(
          "relative inline-flex h-11 w-[300px] max-w-full touch-none items-center justify-center gap-2 overflow-hidden rounded-full select-none",
          "border-negative bg-negative-tint text-body text-ink border-[1.5px] font-semibold",
          className,
        )}
      >
        {/* El relleno es progreso funcional: se anima aunque haya movimiento reducido. */}
        <MotionConfig reducedMotion="never">
          <motion.span
            aria-hidden
            className="bg-negative absolute inset-0 origin-left opacity-[0.28]"
            initial={false}
            animate={{ scaleX: progress }}
            transition={
              demoProgress !== undefined
                ? { duration: 0 }
                : holding
                  ? { duration: duration / 1000, ease: "linear" }
                  : { duration: 0.15, ease: [0.23, 1, 0.32, 1] }
            }
          />
        </MotionConfig>
        <span className="relative flex items-center gap-2">
          <Icon name="trash" size={18} />
          {label}
        </span>
      </button>
      <span id={hintId} className="sr-only">
        Hold Enter for {Math.round(duration / 1000)} seconds to delete {itemName}
      </span>
      <span className="sr-only" aria-live="polite">
        {status}
      </span>
    </>
  );
}

type TwoStepProps = {
  label?: string;
  confirmLabel?: string;
  onConfirm: () => void;
  window?: number;
  className?: string;
};

export function TwoStepDeleteButton({
  label = "Delete",
  confirmLabel = "Press again to confirm",
  onConfirm,
  window: windowMs = TWO_STEP_WINDOW_MS,
  className,
}: TwoStepProps) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function onClick() {
    if (timer.current) clearTimeout(timer.current);
    if (armed) {
      timer.current = null;
      setArmed(false);
      onConfirm();
      return;
    }
    setArmed(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      setArmed(false);
    }, windowMs);
  }

  return (
    <>
      <motion.button
        type="button"
        onClick={onClick}
        whileTap={{ scale: 0.97 }}
        transition={{ duration: 0.1, ease: [0.23, 1, 0.32, 1] }}
        className={cn(
          "text-body inline-flex h-11 items-center justify-center gap-2 rounded-full px-6 font-semibold whitespace-nowrap",
          armed
            ? "bg-danger-fill text-white"
            : "border-negative bg-surface text-ink hover:bg-negative-tint border-[1.5px]",
          className,
        )}
      >
        {!armed && <Icon name="trash" size={18} />}
        {armed ? confirmLabel : label}
      </motion.button>
      <span className="sr-only" aria-live="polite">
        {armed ? confirmLabel : ""}
      </span>
    </>
  );
}
