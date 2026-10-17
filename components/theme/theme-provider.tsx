"use client";

/**
 * Proveedor del tema. El script inline (THEME_SCRIPT) ya puso la clase en
 * <html> antes de pintar; este proveedor:
 * - expone la preferencia actual (leída del DOM) y `setTheme`,
 * - sigue los cambios de prefers-color-scheme cuando la preferencia es "system",
 * - guarda la preferencia en una cookie (para el próximo pintado) y, si se
 *   pide, en profiles.theme.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
} from "react";

import { saveThemePreference } from "@/lib/theme/actions";
import {
  isThemePreference,
  THEME_COOKIE,
  THEME_COOKIE_MAX_AGE,
  type ResolvedTheme,
  type ThemePreference,
} from "@/lib/theme/constants";

type ThemeContextValue = {
  theme: ThemePreference;
  resolved: ResolvedTheme;
  /** Cambia el tema. `persist: false` no escribe en la base (sincronización). */
  setTheme: (theme: ThemePreference, options?: { persist?: boolean }) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const DARK_QUERY = "(prefers-color-scheme: dark)";

function resolve(theme: ThemePreference): ResolvedTheme {
  if (theme !== "system") return theme;
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

/** Aplica la clase en <html> y recuerda la preferencia en la cookie. */
function apply(theme: ThemePreference) {
  const root = document.documentElement;
  root.classList.remove("light", "dark");
  root.classList.add(resolve(theme));
  root.dataset.theme = theme;
  document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;
}

/*
 * El estado del tema vive en el DOM (<html class="dark" data-theme="system">),
 * que es lo que escribe el script inline. useSyncExternalStore lo lee de ahí y
 * un MutationObserver avisa cuando cambia.
 */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "data-theme"],
  });
  return () => observer.disconnect();
}

/** Instantánea "preferencia|resuelto" (un string, para que sea estable). */
function getSnapshot(): string {
  const root = document.documentElement;
  const pref = isThemePreference(root.dataset.theme) ? root.dataset.theme : "system";
  return `${pref}|${root.classList.contains("dark") ? "dark" : "light"}`;
}

/** En el servidor no se conoce el tema: se asume "system" claro. */
const getServerSnapshot = () => "system|light";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [theme, resolved] = snapshot.split("|") as [ThemePreference, ResolvedTheme];

  // Con "system", sigue los cambios del sistema operativo.
  useEffect(() => {
    if (theme !== "system") return;
    const media = window.matchMedia(DARK_QUERY);
    const onChange = () => apply("system");
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback<ThemeContextValue["setTheme"]>((next, options) => {
    apply(next);
    if (options?.persist !== false) void saveThemePreference(next);
  }, []);

  const value = useMemo(() => ({ theme, resolved, setTheme }), [theme, resolved, setTheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme debe usarse dentro de <ThemeProvider>");
  return ctx;
}

/**
 * Sincroniza el tema con profiles.theme al entrar a la app (por ejemplo, si
 * el usuario cambió el tema en otro dispositivo).
 */
export function ThemeSync({ theme }: { theme: ThemePreference }) {
  const { setTheme } = useTheme();
  useEffect(() => {
    if (document.documentElement.dataset.theme !== theme) setTheme(theme, { persist: false });
  }, [theme, setTheme]);
  return null;
}
