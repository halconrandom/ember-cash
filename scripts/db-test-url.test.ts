// La guardia de la base de pruebas solo acepta un Postgres local (A-01 de
// docs/security/AUDIT.md): los tests nunca deben llegar al proyecto real.
import { describe, expect, it } from "vitest";

import { assertLocalTestDatabase } from "./db-test-url.mjs";

describe("assertLocalTestDatabase", () => {
  it("acepta localhost, 127.0.0.1 y ::1 con una base *_test", () => {
    for (const url of [
      "postgresql://localhost:5432/ember_cash_test",
      "postgres://user:clave@127.0.0.1:5433/ember_cash_test",
      "postgresql://[::1]/otra_test",
    ]) {
      expect(assertLocalTestDatabase(url).name).toMatch(/_test$/);
    }
  });

  it("arma la URL de mantenimiento hacia la base postgres", () => {
    const db = assertLocalTestDatabase("postgresql://localhost:5432/ember_cash_test");
    expect(db.maintenanceUrl).toBe("postgresql://localhost:5432/postgres");
  });

  it("rechaza que falte la variable", () => {
    expect(() => assertLocalTestDatabase(undefined)).toThrow(/Falta TEST_DATABASE_URL/);
    expect(() => assertLocalTestDatabase("  ")).toThrow(/Falta TEST_DATABASE_URL/);
  });

  it("rechaza cualquier URL de Supabase", () => {
    for (const url of [
      "postgresql://postgres.abc:clave@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
      "postgresql://postgres:clave@db.ydxqaxyloyhlovhwjpcj.supabase.co:5432/postgres",
      "postgresql://localhost:5432/supabase_test",
    ]) {
      expect(() => assertLocalTestDatabase(url)).toThrow(/supabase/);
    }
  });

  it("rechaza hosts que no son locales", () => {
    for (const url of [
      "postgresql://192.168.1.10:5432/ember_cash_test",
      "postgresql://db.example.com/ember_cash_test",
      "postgresql://localhost.example.com/ember_cash_test",
    ]) {
      expect(() => assertLocalTestDatabase(url)).toThrow(/no es local/);
    }
  });

  it("rechaza bases que no terminan en _test (para no borrar otra base local)", () => {
    expect(() => assertLocalTestDatabase("postgresql://localhost/postgres")).toThrow(/_test/);
    expect(() => assertLocalTestDatabase("postgresql://localhost/ember_cash")).toThrow(/_test/);
  });

  it("rechaza otros esquemas", () => {
    expect(() => assertLocalTestDatabase("http://localhost:5432/ember_cash_test")).toThrow(
      /postgresql:\/\//,
    );
  });
});
