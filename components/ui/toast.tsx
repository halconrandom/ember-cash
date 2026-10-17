"use client";

/**
 * Toast con "Undo" (19-states.png). Reemplaza los diálogos de confirmación en
 * borrados reversibles: dura 6 s, se pausa mientras el puntero o el foco
 * están encima, y "Undo" llama a la función que restaura el elemento.
 *
 *   const toast = useToast();
 *   toast.show({ message: "Transaction deleted", onUndo: () => restore(id) });
 */
import { AnimatePresence, motion } from "motion/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Icon } from "./icon";

/** Duración por defecto (spec: 6 s). */
export const TOAST_DURATION_MS = 6000;

type ToastInput = {
  message: string;
  /** Si existe, el toast muestra el botón "Undo". */
  onUndo?: () => void;
  undoLabel?: string;
  /** Se llama cuando el toast se cierra sin Undo (el borrado queda final). */
  onExpire?: () => void;
  duration?: number;
};

type ToastItem = ToastInput & { id: number };

type ToastContextValue = { show: (toast: ToastInput) => number; dismiss: (id: number) => void };

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((toast: ToastInput) => {
    const id = nextId.current++;
    setToasts((list) => [...list, { ...toast, id }]);
    return id;
  }, []);

  const value = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Región viva: los lectores de pantalla anuncian cada toast. */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex flex-col items-center gap-3 px-4"
      >
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <ToastView key={toast.id} toast={toast} onClose={dismiss} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de <ToastProvider>");
  return ctx;
}

/**
 * Un toast con su temporizador (se pausa con hover o foco). El cierre ocurre
 * una sola vez: mientras el toast anima su salida sigue montado, y su
 * temporizador no debe confirmar un borrado que el usuario ya deshizo.
 */
function ToastView({ toast, onClose }: { toast: ToastItem; onClose: (id: number) => void }) {
  const [paused, setPaused] = useState(false);
  const remaining = useRef(toast.duration ?? TOAST_DURATION_MS);
  const closed = useRef(false);

  const close = useCallback(
    (reason: "expire" | "undo") => {
      if (closed.current) return;
      closed.current = true;
      if (reason === "expire") toast.onExpire?.();
      else toast.onUndo?.();
      onClose(toast.id);
    },
    [toast, onClose],
  );

  useEffect(() => {
    if (paused) return;
    const startedAt = Date.now();
    const timer = setTimeout(() => close("expire"), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current -= Date.now() - startedAt;
    };
  }, [paused, close]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <ToastSurface
        message={toast.message}
        undoLabel={toast.undoLabel}
        onUndo={toast.onUndo ? () => close("undo") : undefined}
      />
    </motion.div>
  );
}

/** Aspecto del toast, separado para mostrarlo estático en el design system. */
export function ToastSurface({
  message,
  onUndo,
  undoLabel = "Undo",
}: {
  message: string;
  onUndo?: () => void;
  undoLabel?: string;
}) {
  return (
    <div
      role="status"
      className="rounded-row border-toast-border bg-toast-bg text-body text-toast-text shadow-pop pointer-events-auto flex min-h-[50px] w-[380px] max-w-[calc(100vw-2rem)] items-center gap-3 border px-5"
    >
      <Icon name="check" className="text-toast-icon" />
      <span className="min-w-0 flex-1">{message}</span>
      {onUndo && (
        <button
          type="button"
          onClick={onUndo}
          className="text-toast-action focus-visible:outline-toast-action font-semibold"
        >
          {undoLabel}
        </button>
      )}
    </div>
  );
}
