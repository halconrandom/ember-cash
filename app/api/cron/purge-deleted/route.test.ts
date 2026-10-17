// Tests de la ruta de purga: exige el secreto y borra lo marcado hace más de un día.
import { beforeEach, describe, expect, it, vi } from "vitest";

const lt = vi.fn();
const del = vi.fn(() => ({ lt }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: () => ({ delete: del }) }),
}));

const { GET } = await import("./route");
const AUTH = { authorization: "Bearer test-cron-secret" };

beforeEach(() => {
  lt.mockReset();
  del.mockClear();
});

describe("GET /api/cron/purge-deleted", () => {
  it("sin el secreto responde 401 y no borra", async () => {
    const res = await GET(new Request("http://x/api/cron/purge-deleted"));
    expect(res.status).toBe(401);
    expect(del).not.toHaveBeenCalled();
  });

  it("borra las transacciones marcadas antes de hace 24 h", async () => {
    lt.mockResolvedValueOnce({ error: null, count: 3 }).mockResolvedValueOnce({
      error: null,
      count: 1,
    });
    const before = Date.now();
    const res = await GET(new Request("http://x/api/cron/purge-deleted", { headers: AUTH }));
    // 3 transacciones + 1 deuda.
    expect(await res.json()).toEqual({ ok: true, purged: 4 });
    const [column, cutoff] = lt.mock.calls[0];
    expect(column).toBe("deleted_at");
    expect(before - new Date(cutoff).getTime()).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 1000);
  });
});
