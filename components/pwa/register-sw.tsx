"use client";

/**
 * Registra el service worker solo en producción. En desarrollo un worker
 * cachea el cascarón y rompe la recarga en caliente.
 */
import { useEffect } from "react";

export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Sin worker la app sigue en el navegador; no hay nada que mostrar.
    });
  }, []);
  return null;
}
