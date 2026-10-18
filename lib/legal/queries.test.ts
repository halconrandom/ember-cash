// Si no se pueden leer los consentimientos, la app no se abre.
import { beforeEach, describe, expect, it, vi } from "vitest";

const select = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    from: () => ({ select }),
  }),
}));
vi.mock("@/lib/log/server", () => ({ logServerError: vi.fn() }));

const { listOwnCurrentConsents } = await import("./queries");
const { hasCurrentConsent } = await import("./consent");

beforeEach(() => {
  select.mockReset();
});

describe("listOwnCurrentConsents", () => {
  it("si la lectura falla, no hay consentimiento y la app queda bloqueada", async () => {
    select.mockResolvedValue({ data: null, error: { message: "relation does not exist" } });
    const rows = await listOwnCurrentConsents();
    expect(rows).toEqual([]);
    expect(hasCurrentConsent(rows)).toBe(false);
  });

  it("devuelve las filas cuando la lectura funciona", async () => {
    const data = [
      { type: "privacy", version: "2026-10-v1" },
      { type: "terms", version: "2026-10-v1" },
    ];
    select.mockResolvedValue({ data, error: null });
    const rows = await listOwnCurrentConsents();
    expect(hasCurrentConsent(rows)).toBe(true);
  });
});
