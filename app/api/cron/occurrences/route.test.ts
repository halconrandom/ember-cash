// Tests de la ruta del cron de vencimientos: secreto y corrida.
import { beforeEach, describe, expect, it, vi } from "vitest";

const runOccurrencesCron = vi.fn();
vi.mock("@/lib/recurring/cron", () => ({ runOccurrencesCron }));

const { GET } = await import("./route");

/** CRON_SECRET de vitest.config.mts. */
const AUTH = { authorization: "Bearer test-cron-secret-not-real-0000000000" };

// El bloque no devuelve el mock: si beforeEach devuelve una función, Vitest
// la llama al terminar el test y volvería a lanzar el error de la prueba.
beforeEach(() => {
  runOccurrencesCron.mockReset();
});

describe("GET /api/cron/occurrences", () => {
  it("sin el secreto responde 401 y no corre", async () => {
    const res = await GET(new Request("http://x/api/cron/occurrences"));
    expect(res.status).toBe(401);
    const wrong = await GET(
      new Request("http://x/api/cron/occurrences", { headers: { authorization: "Bearer otro" } }),
    );
    expect(wrong.status).toBe(401);
    expect(runOccurrencesCron).not.toHaveBeenCalled();
  });

  it("con el secreto materializa y registra", async () => {
    runOccurrencesCron.mockResolvedValue({ ok: true, inserted: 3, overdue: 1 });
    const res = await GET(new Request("http://x/api/cron/occurrences", { headers: AUTH }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, inserted: 3, overdue: 1 });
  });

  it("si la corrida falla responde una clave y no el texto de la base", async () => {
    runOccurrencesCron.mockResolvedValue({
      ok: false,
      error: "No se pudieron leer los perfiles: monto 1800000 de ana@correo.com",
    });
    const res = await GET(new Request("http://x/api/cron/occurrences", { headers: AUTH }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "failed" });
    expect(JSON.stringify(body)).not.toContain("1800000");
    expect(JSON.stringify(body)).not.toContain("ana@correo.com");
  });

  it("si la corrida lanza, la respuesta tampoco lleva el mensaje", async () => {
    runOccurrencesCron.mockRejectedValue(new Error("token eyJhbGciOi.eyJ.firma"));
    const res = await GET(new Request("http://x/api/cron/occurrences", { headers: AUTH }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "failed" });
    expect(JSON.stringify(body)).not.toContain("eyJ");
  });
});
