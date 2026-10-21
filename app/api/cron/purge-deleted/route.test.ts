// Tests de la ruta de purga: exige el secreto y borra lo marcado hace más de un día.
import { beforeEach, describe, expect, it, vi } from "vitest";

const lt = vi.fn();
const del = vi.fn(() => ({ lt }));
const rpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: () => ({ delete: del }), rpc }),
}));

const { GET } = await import("./route");
const AUTH = { authorization: "Bearer test-cron-secret-not-real-0000000000" };

beforeEach(() => {
  lt.mockReset();
  del.mockClear();
  rpc.mockReset();
  rpc.mockResolvedValue({ data: 0, error: null });
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
    rpc.mockResolvedValueOnce({ data: 2, error: null }).mockResolvedValueOnce({
      data: 4,
      error: null,
    });
    const before = Date.now();
    const res = await GET(new Request("http://x/api/cron/purge-deleted", { headers: AUTH }));
    // 3 transacciones + 1 deuda + 2 filas de límite + 4 del bot de Telegram.
    expect(await res.json()).toEqual({ ok: true, purged: 10 });
    expect(rpc).toHaveBeenCalledWith("purge_old_rate_limits");
    expect(rpc).toHaveBeenCalledWith("purge_old_telegram_data");
    const [column, cutoff] = lt.mock.calls[0];
    expect(column).toBe("deleted_at");
    expect(before - new Date(cutoff).getTime()).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000 - 1000);
  });

  it("un fallo al purgar lo del bot responde failed", async () => {
    lt.mockResolvedValueOnce({ error: null, count: 0 }).mockResolvedValueOnce({
      error: null,
      count: 0,
    });
    rpc
      .mockResolvedValueOnce({ data: 0, error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "permission denied" } });
    const res = await GET(new Request("http://x/api/cron/purge-deleted", { headers: AUTH }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "failed" });
  });

  it("un fallo de la base responde failed y no el mensaje", async () => {
    lt.mockResolvedValueOnce({
      error: { message: "permission denied", details: "amount 1800000", hint: "ana@correo.com" },
      count: null,
    });
    const res = await GET(new Request("http://x/api/cron/purge-deleted", { headers: AUTH }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "failed" });
    expect(JSON.stringify(body)).not.toContain("1800000");
    expect(JSON.stringify(body)).not.toContain("ana@correo.com");
  });
});
