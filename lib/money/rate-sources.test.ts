// Tests de las fuentes de la tasa con fetch simulado.
import { describe, expect, it, vi } from "vitest";

import { fetchOpenEr, fetchTrm, fetchUsdCop, OPEN_ER_URL, TRM_URL } from "./rate-sources";

const json = (body: unknown, status = 200) =>
  Promise.resolve(
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
  );

/** Respuestas reales del 17 de octubre de 2026 (recortadas). */
const TRM_OK = [
  {
    valor: "3174.67",
    unidad: "COP",
    vigenciadesde: "2026-10-17T00:00:00.000",
    vigenciahasta: "2026-10-19T00:00:00.000",
  },
];
const OPEN_ER_OK = {
  result: "success",
  time_last_update_unix: 1792195352,
  rates: { COP: 3182.776456, USD: 1 },
};

function fakeFetch(routes: Record<string, () => Promise<Response>>) {
  return vi.fn((url: string) => (routes[url] ?? (() => Promise.reject(new Error("sin red"))))());
}

describe("fuentes de la tasa", () => {
  it("lee la TRM oficial", async () => {
    const rate = await fetchTrm(fakeFetch({ [TRM_URL]: () => json(TRM_OK) }));
    expect(rate).toEqual({
      base: "USD",
      quote: "COP",
      rate: "3174.67",
      asOf: "2026-10-17",
      source: "datos.gov.co",
    });
  });

  it("lee open.er-api", async () => {
    const rate = await fetchOpenEr(fakeFetch({ [OPEN_ER_URL]: () => json(OPEN_ER_OK) }));
    expect(rate.rate).toBe("3182.776456");
    expect(rate.source).toBe("open.er-api.com");
    expect(rate.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("usa la TRM si responde", async () => {
    const fetchImpl = fakeFetch({
      [TRM_URL]: () => json(TRM_OK),
      [OPEN_ER_URL]: () => json(OPEN_ER_OK),
    });
    const { rate } = await fetchUsdCop(fetchImpl);
    expect(rate?.source).toBe("datos.gov.co");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("si la TRM falla usa el respaldo", async () => {
    const { rate, errors } = await fetchUsdCop(
      fakeFetch({
        [TRM_URL]: () => json({ error: "down" }, 503),
        [OPEN_ER_URL]: () => json(OPEN_ER_OK),
      }),
    );
    expect(rate?.source).toBe("open.er-api.com");
    expect(errors[0]).toContain("503");
  });

  it("si las dos fallan no inventa nada", async () => {
    const { rate, errors } = await fetchUsdCop(fakeFetch({}));
    expect(rate).toBeNull();
    expect(errors).toHaveLength(2);
  });

  it("descarta respuestas raras (forma o rango)", async () => {
    await expect(fetchTrm(fakeFetch({ [TRM_URL]: () => json([]) }))).rejects.toThrow();
    await expect(
      fetchTrm(fakeFetch({ [TRM_URL]: () => json([{ ...TRM_OK[0], valor: "3.17" }]) })),
    ).rejects.toThrow(/rango/);
    await expect(
      fetchOpenEr(fakeFetch({ [OPEN_ER_URL]: () => json({ result: "error" }) })),
    ).rejects.toThrow();
  });
});
