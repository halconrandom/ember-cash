"use client";

/**
 * Estado compartido de moneda en el cliente: la tasa más reciente, su estado
 * (al día, actualizando, error) y la moneda de visualización del usuario.
 * Lo usan el chip de la topbar, el selector COP/USD y <MoneyAmount>.
 *
 * - Al perder la red, el estado pasa a "error" (no se puede confirmar la tasa).
 * - refresh(): pide al servidor la tasa más reciente (y la trae de las
 *   fuentes si hace falta). Si falla, queda en "error" y conserva la última
 *   tasa conocida para el tooltip.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";

import type { CurrencyCode } from "@/lib/db/types";
import { refreshRate, saveDisplayCurrency } from "@/lib/money/actions";
import type { Rate } from "@/lib/money/convert";

export type RateStatus = "idle" | "updating" | "error";

type RateContextValue = {
  /** Última tasa conocida (puede ser vieja). Null si nunca hubo una. */
  rate: Rate | null;
  status: RateStatus;
  /** Hora actual (se actualiza cada minuto) para calcular si la tasa es vieja. */
  now: number;
  displayCurrency: CurrencyCode;
  refresh: () => void;
  setDisplayCurrency: (currency: CurrencyCode) => void;
};

const RateContext = createContext<RateContextValue | null>(null);

type Props = {
  initialRate: Rate | null;
  initialDisplayCurrency: CurrencyCode;
  /** Falso en demos (design system): no guarda nada en el servidor. */
  persist?: boolean;
  /** Fuerza un estado (solo para demos). */
  forcedStatus?: RateStatus;
  children: React.ReactNode;
};

export function RateProvider({
  initialRate,
  initialDisplayCurrency,
  persist = true,
  forcedStatus,
  children,
}: Props) {
  const [rate, setRate] = useState(initialRate);
  const [status, setStatus] = useState<RateStatus>(initialRate ? "idle" : "error");
  const [displayCurrency, setCurrency] = useState(initialDisplayCurrency);
  const [now, setNow] = useState(() => Date.now());
  const [, startTransition] = useTransition();

  // Reloj de un minuto: una tasa puede pasar a "vieja" con la página abierta.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Sin red no se puede confirmar la tasa: estado de error con Reintentar.
  useEffect(() => {
    const onOffline = () => setStatus("error");
    window.addEventListener("offline", onOffline);
    return () => window.removeEventListener("offline", onOffline);
  }, []);

  const refresh = useCallback(() => {
    if (!persist) return;
    setStatus("updating");
    startTransition(async () => {
      try {
        const result = await refreshRate();
        if (result.rate) setRate(result.rate);
        setStatus(result.ok ? "idle" : "error");
        setNow(Date.now());
      } catch {
        // Sin red o error del servidor: se conserva la última tasa conocida.
        setStatus("error");
      }
    });
  }, [persist]);

  const setDisplayCurrency = useCallback(
    (currency: CurrencyCode) => {
      setCurrency(currency);
      if (persist) startTransition(() => void saveDisplayCurrency(currency));
    },
    [persist],
  );

  const value = useMemo(
    () => ({
      rate,
      status: forcedStatus ?? status,
      now,
      displayCurrency,
      refresh,
      setDisplayCurrency,
    }),
    [rate, status, forcedStatus, now, displayCurrency, refresh, setDisplayCurrency],
  );
  return <RateContext.Provider value={value}>{children}</RateContext.Provider>;
}

export function useRate(): RateContextValue {
  const ctx = useContext(RateContext);
  if (!ctx) throw new Error("useRate debe usarse dentro de <RateProvider>");
  return ctx;
}
