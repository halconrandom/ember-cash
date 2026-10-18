// consume_rate_limit: un "no" bloquea; un fallo de la llamada deja pasar.
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc }),
}));
vi.mock("@/lib/log/server", () => ({ logServerError: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => `txt:${key}`,
}));

const { consumeRateLimit, decisionFromPayload, isRateLimitedDbError, rateLimitText } =
  await import("./rate-limit");

beforeEach(() => {
  rpc.mockReset();
});

describe("límites", () => {
  it("reconoce el rechazo de la base y no un fallo cualquiera", () => {
    expect(isRateLimitedDbError({ message: "rate_limited" })).toBe(true);
    expect(isRateLimitedDbError({ message: "permission denied" })).toBe(false);
    expect(isRateLimitedDbError(null)).toBe(false);
  });

  it("lee retry_after y usa 60 si el número no sirve", () => {
    expect(decisionFromPayload({ allowed: false, retry_after: 12 })).toEqual({
      allowed: false,
      retryAfter: 12,
    });
    expect(decisionFromPayload({ allowed: false, retry_after: "no" })).toEqual({
      allowed: false,
      retryAfter: 60,
    });
    expect(decisionFromPayload({ allowed: true })).toEqual({ allowed: true });
  });

  it("bloquea cuando la función dice que no", async () => {
    rpc.mockResolvedValue({ data: { allowed: false, retry_after: 9 }, error: null });
    await expect(consumeRateLimit("export")).resolves.toEqual({ allowed: false, retryAfter: 9 });
  });

  it("deja pasar si la función todavía no existe", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "function does not exist" } });
    await expect(consumeRateLimit("write")).resolves.toEqual({ allowed: true });
  });

  it("traduce el mensaje", async () => {
    await expect(rateLimitText("export")).resolves.toBe("txt:export");
  });
});
