/**
 * Tarjeta "Primeros pasos": cuatro pendientes. Se oculta la lista cuando los
 * cuatro están, y la tarjeta entera cuando la persona la descarta. El estado
 * no se guarda: sale de si ya existe cada cosa.
 */
export const FIRST_STEP_KEYS = ["expense", "goal", "debt", "household"] as const;
export type FirstStepKey = (typeof FIRST_STEP_KEYS)[number];

/** A dónde lleva cada pendiente. Los query params son los de la barra (nav.ts). */
export const FIRST_STEP_HREFS: Record<FirstStepKey, string> = {
  expense: "/?tx=new",
  goal: "/savings?goal=new",
  debt: "/debts?debt=new",
  household: "/household",
};

export type FirstStepFlags = Record<FirstStepKey, boolean>;

export type FirstStepItem = { key: FirstStepKey; href: string; done: boolean };

/** Arma la lista y el conteo. allDone es el momento de mostrar el texto final. */
export function firstStepItems(flags: FirstStepFlags): {
  items: FirstStepItem[];
  done: number;
  total: number;
  allDone: boolean;
} {
  const items = FIRST_STEP_KEYS.map((key) => ({
    key,
    href: FIRST_STEP_HREFS[key],
    done: flags[key],
  }));
  const done = items.filter((item) => item.done).length;
  return { items, done, total: items.length, allDone: done === items.length };
}
