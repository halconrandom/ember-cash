// Tests de la ruta del cron de vencimientos: secreto y corrida.
import { beforeEach, describe, expect, it, vi } from "vitest";

const runOccurrencesCron = vi.fn();
vi.mock("@/lib/recurring/cron", () => ({ runOccurrencesCron }));

const { GET } = await import("./route");

/** CRON_SECRET de vitest.config.mts. */
const AUTH = { authorization: "Bearer test-cron-secret" };

beforeEach(() => runOccurrencesCron.mockReset());

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

  it("si la corrida falla responde 500", async () => {
    runOccurrencesCron.mockResolvedValue({ ok: false, error: "sin base" });
    const res = await GET(new Request("http://x/api/cron/occurrences", { headers: AUTH }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "sin base" });
  });
});
