// acceptConsent guarda privacy y terms con la versión del código.
import { beforeEach, describe, expect, it, vi } from "vitest";

const insert = vi.fn();
const getCurrentUser = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => {
      if (table !== "consents") throw new Error(table);
      return { insert };
    },
  }),
}));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser }));
vi.mock("@/lib/log/server", () => ({ logServerError: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));

const { acceptConsent } = await import("./actions");
const { LEGAL_VERSION } = await import("./version");

beforeEach(() => {
  insert.mockReset();
  getCurrentUser.mockReset();
  getCurrentUser.mockResolvedValue({ id: "user-1" });
  insert.mockResolvedValue({ error: null });
});

describe("acceptConsent", () => {
  it("guarda las dos filas con la versión vigente", async () => {
    await expect(acceptConsent()).resolves.toEqual({ ok: true });
    expect(insert).toHaveBeenCalledTimes(2);
    expect(insert).toHaveBeenNthCalledWith(1, { type: "privacy", version: LEGAL_VERSION });
    expect(insert).toHaveBeenNthCalledWith(2, { type: "terms", version: LEGAL_VERSION });
    expect(LEGAL_VERSION).toBe("2026-10-v1");
  });

  it("si una fila ya existe, guarda la otra", async () => {
    insert
      .mockResolvedValueOnce({ error: { code: "23505", message: "duplicate key" } })
      .mockResolvedValueOnce({ error: null });
    await expect(acceptConsent()).resolves.toEqual({ ok: true });
    expect(insert).toHaveBeenCalledTimes(2);
  });

  it("un límite de escrituras no se disfraza de fallo genérico", async () => {
    insert.mockResolvedValueOnce({ error: { code: "P0001", message: "rate_limited" } });
    await expect(acceptConsent()).resolves.toEqual({ ok: false, error: "rateLimited" });
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("sin sesión no guarda nada", async () => {
    getCurrentUser.mockResolvedValue(null);
    await expect(acceptConsent()).rejects.toThrow("redirect:/login");
    expect(insert).not.toHaveBeenCalled();
  });
});
