// Tests de las fuentes de la tasa con fetch simulado.
import { describe, expect, it, vi } from "vitest";

import {
  fetchEurUsd,
  fetchFrankfurter,
  fetchFrankfurterUsdMxn,
  fetchOpenEr,
  fetchOpenErEurUsd,
  fetchOpenErUsdArs,
  fetchOpenErUsdMxn,
  fetchTrm,
  fetchUsdArs,
  fetchUsdCop,
  fetchUsdMxn,
  FRANKFURTER_MXN_URL,
  FRANKFURTER_URL,
  OPEN_ER_URL,
  TRM_URL,
} from "./rate-sources";

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
  rates: { COP: 3182.776456, USD: 1, EUR: 0.926, ARS: 1480.5, MXN: 18.62 },
};
const FRANKFURTER_OK = {
  amount: 1,
  base: "EUR",
  date: "2026-10-17",
  rates: { USD: 1.0876 },
};
const FRANKFURTER_MXN_OK = {
  amount: 1,
  base: "USD",
  date: "2026-10-17",
  rates: { MXN: 18.5 },
};

function fakeFetch(routes: Record<string, () => Promise<Response>>) {
  return vi.fn((url: string) => (routes[url] ?? (() => Promise.reject(new Error("sin red"))))());
}

describe("fuentes de la tasa", () => {
  it("lee la TRM oficial (USD/COP)", async () => {
    const rate = await fetchTrm(fakeFetch({ [TRM_URL]: () => json(TRM_OK) }));
    expect(rate).toEqual({
      base: "USD",
      quote: "COP",
      rate: "3174.67",
      asOf: "2026-10-17",
      source: "datos.gov.co",
    });
  });

  it("lee open.er-api (USD/COP)", async () => {
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

  it("si las dos fallan no inventa nada (USD/COP)", async () => {
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

  it("lee Frankfurter (EUR/USD)", async () => {
    const rate = await fetchFrankfurter(
      fakeFetch({ [FRANKFURTER_URL]: () => json(FRANKFURTER_OK) }),
    );
    expect(rate).toEqual({
      base: "EUR",
      quote: "USD",
      rate: "1.0876",
      asOf: "2026-10-17",
      source: "frankfurter.app",
    });
  });

  it("lee open.er-api como reciprocal (EUR/USD)", async () => {
    const rate = await fetchOpenErEurUsd(fakeFetch({ [OPEN_ER_URL]: () => json(OPEN_ER_OK) }));
    expect(rate.base).toBe("EUR");
    expect(rate.quote).toBe("USD");
    // 1 / 0.926 ≈ 1.079914...
    expect(rate.rate).toBe("1.079914");
    expect(rate.source).toBe("open.er-api.com");
  });

  it("usa Frankfurter si responde, y el respaldo si falla", async () => {
    const ok = await fetchEurUsd(fakeFetch({ [FRANKFURTER_URL]: () => json(FRANKFURTER_OK) }));
    expect(ok.rate?.source).toBe("frankfurter.app");

    const fallback = await fetchEurUsd(
      fakeFetch({
        [FRANKFURTER_URL]: () => json({ error: "down" }, 503),
        [OPEN_ER_URL]: () => json(OPEN_ER_OK),
      }),
    );
    expect(fallback.rate?.source).toBe("open.er-api.com");
  });

  it("descarta una tasa EUR/USD fuera de rango", async () => {
    await expect(
      fetchFrankfurter(
        fakeFetch({
          [FRANKFURTER_URL]: () => json({ ...FRANKFURTER_OK, rates: { USD: 42 } }),
        }),
      ),
    ).rejects.toThrow(/rango/);
  });

  it("lee Frankfurter (USD/MXN): el peso mexicano sí está en el BCE", async () => {
    const rate = await fetchFrankfurterUsdMxn(
      fakeFetch({ [FRANKFURTER_MXN_URL]: () => json(FRANKFURTER_MXN_OK) }),
    );
    expect(rate).toEqual({
      base: "USD",
      quote: "MXN",
      rate: "18.5",
      asOf: "2026-10-17",
      source: "frankfurter.app",
    });
  });

  it("lee open.er-api (USD/MXN), respaldo de Frankfurter", async () => {
    const rate = await fetchOpenErUsdMxn(fakeFetch({ [OPEN_ER_URL]: () => json(OPEN_ER_OK) }));
    expect(rate).toEqual({
      base: "USD",
      quote: "MXN",
      rate: "18.62",
      asOf: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      source: "open.er-api.com",
    });
  });

  it("usa Frankfurter para MXN si responde, y el respaldo si falla", async () => {
    const ok = await fetchUsdMxn(
      fakeFetch({ [FRANKFURTER_MXN_URL]: () => json(FRANKFURTER_MXN_OK) }),
    );
    expect(ok.rate?.source).toBe("frankfurter.app");

    const fallback = await fetchUsdMxn(
      fakeFetch({
        [FRANKFURTER_MXN_URL]: () => json({ error: "down" }, 503),
        [OPEN_ER_URL]: () => json(OPEN_ER_OK),
      }),
    );
    expect(fallback.rate?.source).toBe("open.er-api.com");
  });

  it("lee open.er-api (USD/ARS): el peso argentino no está en el BCE", async () => {
    const rate = await fetchOpenErUsdArs(fakeFetch({ [OPEN_ER_URL]: () => json(OPEN_ER_OK) }));
    expect(rate).toEqual({
      base: "USD",
      quote: "ARS",
      rate: "1480.5",
      asOf: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      source: "open.er-api.com",
    });
  });

  it("ARS solo tiene una fuente: si falla, no inventa nada", async () => {
    const { rate, errors } = await fetchUsdArs(fakeFetch({}));
    expect(rate).toBeNull();
    expect(errors).toHaveLength(1);
  });

  it("descarta una tasa ARS fuera de rango", async () => {
    await expect(
      fetchOpenErUsdArs(
        fakeFetch({
          [OPEN_ER_URL]: () => json({ ...OPEN_ER_OK, rates: { ...OPEN_ER_OK.rates, ARS: 1 } }),
        }),
      ),
    ).rejects.toThrow(/rango/);
  });
});
