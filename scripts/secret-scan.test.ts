// Detector de secretos (scripts/secret-scan.mts). Los tokens de aquí son
// falsos: se arman en el test para no dejar nada parecido a un secreto en el
// repositorio (el hook de pre-commit también los marcaría).
import { describe, expect, it } from "vitest";

import { findSecrets, isServerSupabaseKey, jwtRole } from "./secret-scan.mjs";

/** JWT falso con el rol pedido (firma de relleno). */
function fakeJwt(role: string): string {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${part({ alg: "HS256", typ: "JWT" })}.${part({ iss: "supabase", role, ref: "abc" })}.${"x".repeat(43)}`;
}

describe("jwtRole e isServerSupabaseKey", () => {
  it("distingue la anon key (pública) de la service role", () => {
    expect(jwtRole(fakeJwt("anon"))).toBe("anon");
    expect(isServerSupabaseKey(fakeJwt("anon"))).toBe(false);
    expect(isServerSupabaseKey(fakeJwt("service_role"))).toBe(true);
    expect(isServerSupabaseKey(["sb", "secret", "abcdefghijkl"].join("_"))).toBe(true);
    expect(isServerSupabaseKey(["sb", "publishable", "abcdefghijkl"].join("_"))).toBe(false);
    expect(isServerSupabaseKey("no-es-una-llave")).toBe(false);
  });
});

describe("findSecrets", () => {
  it("marca una service role dentro de un chunk de JavaScript", () => {
    const chunk = `var a="${fakeJwt("service_role")}";`;
    expect(findSecrets(chunk).map((f) => f.kind)).toContain("JWT de Supabase con rol service_role");
  });

  it("no marca la anon key", () => {
    expect(findSecrets(`var k="${fakeJwt("anon")}";`)).toEqual([]);
  });

  it("marca el valor real de un secreto conocido sin revelarlo completo", () => {
    const secret = "f".repeat(64);
    const [finding] = findSecrets(`x${secret}y`, [secret]);
    expect(finding.kind).toBe("valor real de un secreto del entorno");
    expect(finding.preview).not.toContain(secret);
  });

  it("ignora secretos conocidos demasiado cortos (evita falsos positivos)", () => {
    expect(findSecrets("abc", ["abc"])).toEqual([]);
  });

  it("marca asignaciones con valor de los secretos de servidor", () => {
    const line = ["SUPABASE_SERVICE_ROLE_KEY", "=", "valor-largo-123"].join("");
    expect(findSecrets(line).map((f) => f.kind)).toContain("asignación de un secreto de servidor");
    // El nombre solo, sin valor (como en .env.example o en el código), no.
    expect(findSecrets("SUPABASE_SERVICE_ROLE_KEY=")).toEqual([]);
    expect(findSecrets("const { CRON_SECRET } = getServerEnv();")).toEqual([]);
    // Código, no valores: esquemas y llamadas.
    expect(findSecrets("  CRON_SECRET: z.string().min(32),")).toEqual([]);
    expect(findSecrets("const CRON_SECRET = getServerEnv().CRON_SECRET;")).toEqual([]);
    // Un literal entre comillas sí.
    expect(findSecrets(['CRON_SECRET: "', "a1b2c3d4e5f6", '"'].join(""))).not.toEqual([]);
  });

  it("no marca los valores falsos de los tests", () => {
    expect(findSecrets('CRON_SECRET: "test-cron-secret-not-real-0000000000"')).toEqual([]);
    expect(findSecrets('SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key"')).toEqual([]);
  });

  it("marca llaves privadas y de otros proveedores", () => {
    const pem = ["-----BEGIN", "PRIVATE", "KEY-----"].join(" ");
    const aws = ["AKIA", "ABCDEFGHIJKLMNOP"].join("");
    const kinds = findSecrets(`${pem}\n${aws}`).map((f) => f.kind);
    expect(kinds).toContain("llave privada PEM");
    expect(kinds).toContain("llave de AWS");
  });
});
