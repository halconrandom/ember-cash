/**
 * Detector de secretos compartido por el chequeo del bundle
 * (scripts/check-client-bundle.mjs) y el hook de pre-commit
 * (scripts/pre-commit-secrets.mjs). Lo prueba secret-scan.test.ts.
 *
 * Busca en un texto:
 * - los valores exactos que se le pasen (la service role y CRON_SECRET del
 *   entorno), si tienen al menos 16 caracteres;
 * - JWT de Supabase con rol service_role o supabase_admin (la anon key es
 *   pública y no se marca);
 * - llaves nuevas de Supabase sb_secret_… (las sb_publishable_ son públicas);
 * - llaves privadas PEM, llaves de AWS (AKIA…), llaves de Stripe (sk_live_ y
 *   sk_test_) y tokens de GitHub (ghp_, github_pat_);
 * - asignaciones con valor de SUPABASE_SERVICE_ROLE_KEY o CRON_SECRET,
 *   salvo valores claramente falsos (con "test", "example", "not-real" o
 *   "placeholder"), como los de vitest.config.mts.
 *
 * Nunca devuelve el secreto completo: solo un recorte para ubicarlo.
 * Es .mts para que Node lo cargue como módulo ES desde los scripts .mjs.
 */

export type SecretFinding = {
  /** Qué se encontró (para el mensaje). */
  kind: string;
  /** Recorte que no revela el valor completo. */
  preview: string;
};

const ASSIGNMENT = "asignación de un secreto de servidor";
/** Valores de ejemplo o de tests que no son secretos. */
const FAKE_VALUE = /test|example|not-real|placeholder/i;

const PATTERNS: { kind: string; regex: RegExp }[] = [
  { kind: "llave nueva de Supabase (sb_secret_)", regex: /sb_secret_[A-Za-z0-9_-]{10,}/g },
  { kind: "llave privada PEM", regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { kind: "llave de AWS", regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: "llave de Stripe", regex: /\bsk_(?:live|test)_[A-Za-z0-9]{16,}/g },
  { kind: "token de GitHub", regex: /\b(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})/g },
  {
    kind: ASSIGNMENT,
    // Estilo .env (NOMBRE=valor, sin espacios) o un literal entre comillas
    // (NOMBRE: "valor", NOMBRE = "valor"), con al menos 8 caracteres. Código
    // como `CRON_SECRET: z.string()` o `CRON_SECRET = getEnv()` no cuenta.
    regex:
      /\b(?:SUPABASE_SERVICE_ROLE_KEY|CRON_SECRET)(?:=["']?|\s*[:=]\s*["'])[A-Za-z0-9._-]{8,}/g,
  },
];

const JWT = /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;

/** Rol de un JWT (sin verificar la firma) o null si no se puede leer. */
export function jwtRole(token: string): string | null {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    return typeof payload?.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

/** ¿Es una llave de servidor de Supabase (service role JWT o sb_secret_)? */
export function isServerSupabaseKey(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.startsWith("sb_secret_")) return true;
  if (/^eyJ[^.]+\.eyJ[^.]+\.[^.]+$/.test(trimmed)) {
    const role = jwtRole(trimmed);
    return role === "service_role" || role === "supabase_admin";
  }
  return false;
}

function preview(value: string): string {
  return value.length <= 12 ? `${value.slice(0, 4)}…` : `${value.slice(0, 10)}…(${value.length})`;
}

export function findSecrets(text: string, knownSecrets: readonly string[] = []): SecretFinding[] {
  const findings: SecretFinding[] = [];
  for (const secret of knownSecrets) {
    if (secret && secret.length >= 16 && text.includes(secret)) {
      findings.push({ kind: "valor real de un secreto del entorno", preview: preview(secret) });
    }
  }
  for (const match of text.matchAll(JWT)) {
    const role = jwtRole(match[0]);
    if (role === "service_role" || role === "supabase_admin") {
      findings.push({ kind: `JWT de Supabase con rol ${role}`, preview: preview(match[0]) });
    }
  }
  for (const { kind, regex } of PATTERNS) {
    for (const match of text.matchAll(regex)) {
      if (kind === ASSIGNMENT && FAKE_VALUE.test(match[0])) continue;
      findings.push({ kind, preview: preview(match[0]) });
    }
  }
  return findings;
}
