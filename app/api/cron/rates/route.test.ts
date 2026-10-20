// Tests de la ruta del cron de tasas: secreto, éxito y fallo sin escribir.
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchAndStoreRates = vi.fn();
vi.mock("@/lib/money/rates", () => ({ fetchAndStoreRates }));

const { GET } = await import("./route");

/** CRON_SECRET de vitest.config.mts. */
const AUTH = { authorization: "Bearer test-cron-secret-not-real-0000000000" };

const usdCopRate = {
  base: "USD",
  quote: "COP",
  rate: "3174.67",
  asOf: "2026-10-17",
  fetchedAt: "2026-10-17T13:00:00Z",
  source: "datos.gov.co",
};
const eurUsdRate = {
  base: "EUR",
  quote: "USD",
  rate: "1.08",
  asOf: "2026-10-17",
  fetchedAt: "2026-10-17T13:00:00Z",
  source: "frankfurter.app",
};
const eurCopRate = {
  base: "EUR",
  quote: "COP",
  rate: "3430.6236",
  asOf: "2026-10-17",
  fetchedAt: "2026-10-17T13:00:00Z",
  source: "derived:frankfurter.app+datos.gov.co",
};

// El bloque no devuelve el mock: Vitest trataría esa función como limpieza.
beforeEach(() => {
  fetchAndStoreRates.mockReset();
});

describe("GET /api/cron/rates", () => {
  it("sin el secreto responde 401 y no consulta nada", async () => {
    const res = await GET(new Request("http://x/api/cron/rates"));
    expect(res.status).toBe(401);
    const wrong = await GET(
      new Request("http://x/api/cron/rates", { headers: { authorization: "Bearer otro" } }),
    );
    expect(wrong.status).toBe(401);
    expect(fetchAndStoreRates).not.toHaveBeenCalled();
  });

  it("con el secreto guarda los tres pares y los devuelve", async () => {
    const rates = {
      usdCop: { ok: true, rate: usdCopRate },
      eurUsd: { ok: true, rate: eurUsdRate },
      eurCop: { ok: true, rate: eurCopRate },
    };
    fetchAndStoreRates.mockResolvedValue(rates);
    const res = await GET(new Request("http://x/api/cron/rates", { headers: AUTH }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, rates });
  });

  it("si falla un solo par responde 200 (los otros dos sí se guardaron)", async () => {
    fetchAndStoreRates.mockResolvedValue({
      usdCop: { ok: true, rate: usdCopRate },
      eurUsd: { ok: false, errors: ["HTTP 503", "sin red"] },
      eurCop: { ok: false, errors: ["No se pudo derivar EUR/COP: falta USD/COP, EUR/USD, o las dos."] },
    });
    const res = await GET(new Request("http://x/api/cron/rates", { headers: AUTH }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it("si los tres fallan responde 502", async () => {
    fetchAndStoreRates.mockResolvedValue({
      usdCop: { ok: false, errors: ["HTTP 503", "sin red"] },
      eurUsd: { ok: false, errors: ["HTTP 503", "sin red"] },
      eurCop: { ok: false, errors: ["falta USD/COP, EUR/USD, o las dos."] },
    });
    const res = await GET(new Request("http://x/api/cron/rates", { headers: AUTH }));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, error: "all_sources_failed" });
  });
});
