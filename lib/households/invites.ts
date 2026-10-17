/**
 * Tokens de invitación a un household.
 *
 * El token en claro solo existe en el link que se comparte. En la base se
 * guarda su SHA-256 en hexadecimal, calculado igual que en la función SQL
 * accept_invite: encode(sha256(convert_to(token, 'UTF8')), 'hex').
 */
import { createHash, randomBytes } from "node:crypto";

/** Formato del token: base64url de 32 bytes aleatorios (43 caracteres). */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** Genera un token nuevo con 256 bits de entropía. */
export function generateInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Hash que se guarda en household_invites.token_hash. */
export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Construye el link que el owner comparte. */
export function buildInviteUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/invite/${token}`;
}

/**
 * Interpreta el jsonb de accept_invite. Si ok es false, error es el código
 * (invite_invalid, invite_rate_limited, ...). Una forma inesperada se trata
 * como fallo sin código, y quien llama usa el mensaje genérico.
 */
export function readInviteResult(data: unknown): { ok: boolean; error: string | null } {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, error: null };
  }
  const row = data as { ok?: unknown; error?: unknown };
  return {
    ok: row.ok === true,
    error: typeof row.error === "string" ? row.error : null,
  };
}

/**
 * Extrae el token de lo que el usuario pegue: el link completo
 * (https://.../invite/<token>) o solo el token. Devuelve null si no parece
 * un token válido.
 */
export function extractInviteToken(input: string): string | null {
  const value = input.trim();
  const match = value.match(/\/invite\/([^/?#\s]+)/);
  const candidate = match ? match[1] : value;
  return TOKEN_PATTERN.test(candidate) ? candidate : null;
}
