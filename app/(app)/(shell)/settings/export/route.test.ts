// La exportación responde 429 con Retry-After cuando se agota el cupo.
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const getSession = vi.fn();
const buildBackupZip = vi.fn();

vi.mock("@/lib/auth/session", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc, auth: { getSession } }),
}));
vi.mock("@/lib/export/backup", () => ({ buildBackupZip }));
vi.mock("@/lib/env", () => ({
  getPublicEnv: () => ({
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-de-prueba",
  }),
}));
vi.mock("@/lib/log/server", () => ({ logServerError: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string) => `txt:${key}`,
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { GET } = await import("./route");

beforeEach(() => {
  rpc.mockReset();
  getSession.mockReset();
  buildBackupZip.mockReset();
});

describe("GET /settings/export", () => {
  it("responde 429 con Retry-After y no arma el archivo", async () => {
    rpc.mockResolvedValue({ data: { allowed: false, retry_after: 40 }, error: null });
    const res = await GET();
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("40");
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await res.text()).toBe("txt:export");
    expect(buildBackupZip).not.toHaveBeenCalled();
  });

  it("arma el archivo cuando todavía hay cupo", async () => {
    rpc.mockResolvedValue({ data: { allowed: true, retry_after: 0 }, error: null });
    getSession.mockResolvedValue({ data: { session: { access_token: "token-de-prueba" } } });
    buildBackupZip.mockResolvedValue(new Uint8Array([1, 2, 3]));
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/zip");
    expect(buildBackupZip).toHaveBeenCalledOnce();
  });
});
