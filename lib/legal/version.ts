/**
 * Versión vigente del aviso de privacidad y de los términos.
 *
 * Si cambia LEGAL_VERSION, quien ya aceptó una versión anterior vuelve a ver
 * la pantalla de consentimiento: las filas viejas no se editan. LEGAL_VERSION_DATE
 * es la fecha de este texto (el {date} de legal.versionLine), no el momento
 * en que cada persona aceptó. Ese momento lo guarda consents.accepted_at.
 */

/** Ejemplo de la fase: 2026-10-v1. Tiene que coincidir con el test SQL. */
export const LEGAL_VERSION = "2026-10-v1";

/** Día de esta versión, AAAA-MM-DD. Se formatea al mostrarla. */
export const LEGAL_VERSION_DATE = "2026-10-17";
