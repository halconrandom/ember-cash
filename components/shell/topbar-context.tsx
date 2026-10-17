"use client";

/**
 * Subtítulo de la topbar que pone cada página con datos ("42 transacciones en
 * octubre de 2026"). La topbar vive en el layout; la página lo declara con
 * <TopbarSubtitle text="..." />. Una página puede ocultar la acción principal
 * con <TopbarHideAction /> (Hogar en scope Personal).
 */
import { createContext, useContext, useEffect, useState } from "react";

type TopbarContextValue = {
  subtitle: string | null;
  setSubtitle: (s: string | null) => void;
  actionHidden: boolean;
  setActionHidden: (hidden: boolean) => void;
};

const TopbarContext = createContext<TopbarContextValue | null>(null);

export function TopbarProvider({ children }: { children: React.ReactNode }) {
  const [subtitle, setSubtitle] = useState<string | null>(null);
  const [actionHidden, setActionHidden] = useState(false);
  return (
    <TopbarContext.Provider value={{ subtitle, setSubtitle, actionHidden, setActionHidden }}>
      {children}
    </TopbarContext.Provider>
  );
}

export function useTopbar(): TopbarContextValue {
  return (
    useContext(TopbarContext) ?? {
      subtitle: null,
      setSubtitle: () => undefined,
      actionHidden: false,
      setActionHidden: () => undefined,
    }
  );
}

/** Declara el subtítulo mientras la página está montada. */
export function TopbarSubtitle({ text }: { text: string }) {
  const { setSubtitle } = useTopbar();
  useEffect(() => {
    setSubtitle(text);
    return () => setSubtitle(null);
  }, [text, setSubtitle]);
  return null;
}

/** Oculta la acción principal de la topbar mientras la página está montada. */
export function TopbarHideAction() {
  const { setActionHidden } = useTopbar();
  useEffect(() => {
    setActionHidden(true);
    return () => setActionHidden(false);
  }, [setActionHidden]);
  return null;
}
