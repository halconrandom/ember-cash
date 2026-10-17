// Tests de la ruta del cron de tasas: secreto, éxito y fallo sin escribir.
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchAndStoreRate = vi.fn();
vi.mock("@/lib/money/rates", () => ({ fetchAndStoreRate }));

const { GET } = await import("./route");

/** CRON_SECRET de vitest.config.mts. */
const AUTH = { authorization: "Bearer test-cron-secret-not-real-0000000000" };

beforeEach(() => fetchAndStoreRate.mockReset());

describe("GET /api/cron/rates", () => {
  it("sin el secreto responde 401 y no consulta nada", async () => {
    const res = await GET(new Request("http://x/api/cron/rates"));
    expect(res.status).toBe(401);
    const wrong = await GET(
      new Request("http://x/api/cron/rates", { headers: { authorization: "Bearer otro" } }),
    );
    expect(wrong.status).toBe(401);
    expect(fetchAndStoreRate).not.toHaveBeenCalled();
  });

  it("con el secreto guarda la tasa y la devuelve", async () => {
    const rate = {
      base: "USD",
      quote: "COP",
      rate: "3174.67",
      asOf: "2026-10-17",
      fetchedAt: "2026-10-17T13:00:00Z",
      source: "datos.gov.co",
    };
    fetchAndStoreRate.mockResolvedValue({ ok: true, rate });
    const res = await GET(new Request("http://x/api/cron/rates", { headers: AUTH }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, rate });
  });

  it("si las dos fuentes fallan responde 502", async () => {
    fetchAndStoreRate.mockResolvedValue({ ok: false, errors: ["HTTP 503", "sin red"] });
    const res = await GET(new Request("http://x/api/cron/rates", { headers: AUTH }));
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ ok: false, error: "all_sources_failed" });
  });
});
