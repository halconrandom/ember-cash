"use client";

/**
 * Estado compartido de moneda en el cliente: las tasas conocidas (fase E2:
 * USD/COP, EUR/USD y EUR/COP, cada una con su historial por fecha), su
 * estado (al día, actualizando, error) y la moneda de visualización del
 * usuario (COP, USD o EUR). Lo usan el chip de la topbar, el selector de
 * moneda y <MoneyAmount>.
 *
 * - Al perder la red, el estado pasa a "error" (no se puede confirmar la tasa).
 * - refresh(): pide al servidor las tasas más recientes (y las trae de las
 *   fuentes si hace falta). Si falla, queda en "error" y conserva las
 *   últimas tasas conocidas para el tooltip.
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
import { refreshRates, saveDisplayCurrency } from "@/lib/money/actions";
import type { Rate } from "@/lib/money/convert";

export type RateStatus = "idle" | "updating" | "error";

type RateContextValue = {
  /** Últimas tasas conocidas (pueden ser viejas). Vacío si nunca hubo ninguna. */
  rates: Rate[];
  status: RateStatus;
  /** Hora actual (se actualiza cada minuto) para calcular si una tasa es vieja. */
  now: number;
  displayCurrency: CurrencyCode;
  /** profiles.enabled_currencies (fase E5): qué monedas ofrecen los <CurrencyPicker>. */
  enabledCurrencies: CurrencyCode[];
  refresh: () => void;
  setDisplayCurrency: (currency: CurrencyCode) => void;
  setEnabledCurrencies: (currencies: CurrencyCode[]) => void;
};

const RateContext = createContext<RateContextValue | null>(null);

type Props = {
  initialRates: Rate[];
  initialDisplayCurrency: CurrencyCode;
  /** profiles.enabled_currencies (fase E5). Por defecto, las 3 de siempre. */
  initialEnabledCurrencies?: CurrencyCode[];
  /** Falso en demos (design system): no guarda nada en el servidor. */
  persist?: boolean;
  /** Fuerza un estado (solo para demos). */
  forcedStatus?: RateStatus;
  children: React.ReactNode;
};

export function RateProvider({
  initialRates,
  initialDisplayCurrency,
  initialEnabledCurrencies,
  persist = true,
  forcedStatus,
  children,
}: Props) {
  const [rates, setRates] = useState(initialRates);
  const [status, setStatus] = useState<RateStatus>(initialRates.length > 0 ? "idle" : "error");
  const [displayCurrency, setCurrency] = useState(initialDisplayCurrency);
  const [enabledCurrencies, setEnabledCurrenciesState] = useState<CurrencyCode[]>(
    initialEnabledCurrencies ?? ["COP", "USD", "EUR"],
  );
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
        const result = await refreshRates();
        if (result.rates.length > 0) setRates(result.rates);
        setStatus(result.ok ? "idle" : "error");
        setNow(Date.now());
      } catch {
        // Sin red o error del servidor: se conservan las últimas tasas conocidas.
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

  // Guardado en el servidor: lo hace la sección Monedas de Ajustes, que ya
  // sabe el resultado de su propia Server Action; aquí solo se refleja en
  // el estado para que los <CurrencyPicker> abiertos lo vean al instante.
  const setEnabledCurrencies = useCallback((currencies: CurrencyCode[]) => {
    setEnabledCurrenciesState(currencies);
  }, []);

  const value = useMemo(
    () => ({
      rates,
      status: forcedStatus ?? status,
      now,
      displayCurrency,
      enabledCurrencies,
      refresh,
      setDisplayCurrency,
      setEnabledCurrencies,
    }),
    [
      rates,
      status,
      forcedStatus,
      now,
      displayCurrency,
      enabledCurrencies,
      refresh,
      setDisplayCurrency,
      setEnabledCurrencies,
    ],
  );
  return <RateContext.Provider value={value}>{children}</RateContext.Provider>;
}

export function useRate(): RateContextValue {
  const ctx = useContext(RateContext);
  if (!ctx) throw new Error("useRate debe usarse dentro de <RateProvider>");
  return ctx;
}
