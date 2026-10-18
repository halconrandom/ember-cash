/**
 * Regla de consentimiento vigente. Pura: no lee la base ni cookies.
 * La app solo se usa si existen las dos filas (privacy y terms) de LEGAL_VERSION.
 */
import { LEGAL_VERSION } from "./version";

/** Tipos que pide la tabla consents. Los dos hacen falta. */
export const CONSENT_TYPES = ["privacy", "terms"] as const;
export type ConsentType = (typeof CONSENT_TYPES)[number];

/** Resultado de guardar el consentimiento. "consent" lo decide la pantalla, no la acción. */
export type ConsentActionResult = { ok: true } | { ok: false; error: "rateLimited" | "saveFailed" };

/**
 * True solo si hay una fila de cada tipo en la versión pedida.
 * Una versión anterior no cuenta: hay que aceptar de nuevo.
 */
export function hasCurrentConsent(
  rows: readonly { type: string; version: string }[],
  version: string = LEGAL_VERSION,
): boolean {
  return CONSENT_TYPES.every((type) =>
    rows.some((row) => row.type === type && row.version === version),
  );
}
