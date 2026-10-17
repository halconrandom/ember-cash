"use client";

/**
 * Proveedores de cliente para toda la app:
 * - ThemeProvider: tema claro/oscuro/sistema.
 * - MotionConfig reducedMotion="user": con prefers-reduced-motion, motion
 *   quita las animaciones de transformación y deja solo opacidad.
 * - ToastProvider: toasts con Undo.
 */
import { MotionConfig } from "motion/react";

import { ThemeProvider } from "@/components/theme/theme-provider";
import { ToastProvider } from "@/components/ui/toast";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <MotionConfig reducedMotion="user">
        <ToastProvider>{children}</ToastProvider>
      </MotionConfig>
    </ThemeProvider>
  );
}
