/**
 * Qué eventos se pueden guardar y con qué props. La base repite estas reglas
 * en events_stamp (0023): aquí fallamos antes de gastar un cupo de escritura.
 * Sin analítica externa: el nombre es una lista cerrada.
 */
import type { Json } from "@/lib/db/types";

export const EVENT_NAMES = [
  "onboarding_started",
  "onboarding_step_completed",
  "onboarding_skipped",
  "onboarding_completed",
  "first_item_created",
  "help_opened",
] as const;
export type EventName = (typeof EVENT_NAMES)[number];

/** Lo que el wizard (y, más adelante, un gasto) puede marcar como primer elemento. */
export const FIRST_ITEM_TYPES = ["account", "goal", "debt", "subscription", "expense"] as const;
export type FirstItemType = (typeof FIRST_ITEM_TYPES)[number];

/** Páginas con botón de ayuda. El panel es la fase F2; el evento ya está cerrado. */
export const HELP_PAGES = [
  "dashboard",
  "transactions",
  "savings",
  "debts",
  "subscriptions",
  "calendar",
  "household",
  "settings",
] as const;
export type HelpPage = (typeof HELP_PAGES)[number];

const STEP_EVENTS = new Set<EventName>(["onboarding_step_completed", "onboarding_skipped"]);
const EMPTY_EVENTS = new Set<EventName>(["onboarding_started", "onboarding_completed"]);

export type ValidEvent = { name: EventName; props: Json };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Paso del wizard: 0 bienvenida … 4 panel. Entero, sin claves de más. */
function stepProps(props: Record<string, unknown>): Json | null {
  const keys = Object.keys(props);
  const step = props.step;
  if (keys.length !== 1 || keys[0] !== "step") return null;
  if (typeof step !== "number" || !Number.isInteger(step) || step < 0 || step > 4) return null;
  return { step };
}

/**
 * Acepta el par nombre + props o lo rechaza. No inventa props: started y
 * completed van vacíos; el resto lleva exactamente una clave.
 */
export function validateEvent(name: unknown, props: unknown): ValidEvent | null {
  if (typeof name !== "string" || !(EVENT_NAMES as readonly string[]).includes(name)) return null;
  const eventName = name as EventName;
  const body = props === undefined ? {} : props;
  if (!isPlainObject(body)) return null;

  if (EMPTY_EVENTS.has(eventName)) {
    return Object.keys(body).length === 0 ? { name: eventName, props: {} } : null;
  }
  if (STEP_EVENTS.has(eventName)) {
    const step = stepProps(body);
    return step ? { name: eventName, props: step } : null;
  }
  if (eventName === "first_item_created") {
    const keys = Object.keys(body);
    const type = body.type;
    if (keys.length !== 1 || keys[0] !== "type") return null;
    if (typeof type !== "string" || !(FIRST_ITEM_TYPES as readonly string[]).includes(type)) {
      return null;
    }
    return { name: eventName, props: { type } };
  }
  const keys = Object.keys(body);
  const page = body.page;
  if (keys.length !== 1 || keys[0] !== "page") return null;
  if (typeof page !== "string" || !(HELP_PAGES as readonly string[]).includes(page)) return null;
  return { name: eventName, props: { page } };
}
