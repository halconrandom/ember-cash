/**
 * security.txt (RFC 9116). Expires es un año después de esta compilación,
 * no de cada petición: la fecha queda fija en el código de esta versión.
 */

/** Momento de esta versión del archivo. Cambiarlo al volver a publicarlo. */
export const SECURITY_TXT_COMPILED_AT = "2026-10-17T00:00:00.000Z";

/** Un año después de `compiledAt`, en UTC. */
export function securityTxtExpires(compiledAt: string): string {
  const expires = new Date(compiledAt);
  expires.setUTCFullYear(expires.getUTCFullYear() + 1);
  return expires.toISOString();
}

/** Texto plano con Contact, Expires, Preferred-Languages y Canonical. */
export function securityTxt(input: {
  contactEmail: string;
  canonical: string;
  compiledAt?: string;
}): string {
  const compiledAt = input.compiledAt ?? SECURITY_TXT_COMPILED_AT;
  return [
    `Contact: mailto:${input.contactEmail}`,
    `Expires: ${securityTxtExpires(compiledAt)}`,
    "Preferred-Languages: es, en",
    `Canonical: ${input.canonical}`,
    "",
  ].join("\n");
}
